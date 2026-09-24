"""A denied SUB-read must not publish the default it left behind under a Live badge.

Both services here follow the same shape: one call establishes that the service is on
(`macie2:GetMacieSession`, `verifiedpermissions:ListPolicyStores`), then several more read
the actual contents. Only the first was ever checked. When a content read was denied the
helper returned `[]` or wrote nothing, the response still said `live=True`, and every count
derived from that read rendered as a measured zero.

Zero is the reassuring answer in both panels - "no sensitive data found", "no policies in
this store" - so this failure mode does not get investigated, it gets believed. These tests
pin the distinction the code now draws: `[]` means Macie looked and found nothing, `None`
means the look never happened.

Both directions are asserted for each service. A test that only checks the denied case
passes against a service hardwired to `live=False`, which would be a different bug.
"""

import boto3
import pytest
from botocore.exceptions import ClientError

from services import govern_macie_service as macie_mod
from services import govern_verified_permissions_service as vp_mod


def _denied(op: str) -> ClientError:
    return ClientError(
        {"Error": {"Code": "AccessDeniedException", "Message": f"not authorized to {op}"}}, op
    )


# ─────────────────────────────── Macie ───────────────────────────────


class FakeMacie:
    """macie2 with an ENABLED session and selectively denied content reads.

    No `get_paginator`; neither Macie path uses one.
    """

    def __init__(self, deny_stats=(), deny_sample=False):
        self.deny_stats = set(deny_stats)
        self.deny_sample = deny_sample

    def get_macie_session(self):
        return {"status": "ENABLED", "findingPublishingFrequency": "FIFTEEN_MINUTES"}

    def get_finding_statistics(self, groupBy, size=50):  # noqa: N803 - botocore's casing
        if groupBy in self.deny_stats:
            raise _denied("GetFindingStatistics")
        counts = {
            "type": [
                {"groupKey": "SensitiveData:S3Object/Personal", "count": 4},
                {"groupKey": "Policy:IAMUser/S3BucketPublic", "count": 1},
            ],
            "severity.description": [
                {"groupKey": "High", "count": 4},
                {"groupKey": "Low", "count": 1},
            ],
            "resourcesAffected.s3Bucket.name": [{"groupKey": "bucket-a", "count": 5}],
        }
        return {"countsByGroup": counts.get(groupBy, [])}

    def list_findings(self, **kw):
        if self.deny_sample:
            raise _denied("ListFindings")
        return {"findingIds": ["f-1"]}

    def get_findings(self, **kw):
        if self.deny_sample:
            raise _denied("GetFindings")
        return {
            "findings": [
                {
                    "id": "f-1",
                    "type": "SensitiveData:S3Object/Personal",
                    "category": "CLASSIFICATION",
                    "severity": {"description": "High"},
                    "title": "Personal information found",
                    "resourcesAffected": {"s3Bucket": {"name": "bucket-a"}},
                }
            ]
        }


def _macie(monkeypatch, **kw):
    fake = FakeMacie(**kw)
    monkeypatch.setattr(macie_mod.boto3, "client", lambda *a, **k: fake)
    return macie_mod.GovernMacieService(region="us-east-1")._fetch_data_sensitivity()


def test_macie_reads_that_all_succeed_are_live(monkeypatch):
    r = _macie(monkeypatch)
    assert r.live is True
    assert r.source == "macie2"
    assert r.total_findings == 5
    assert r.classification_findings == 4
    assert r.policy_findings == 1


def test_macie_enabled_with_zero_findings_is_still_live(monkeypatch):
    """The measured-empty case. An account Macie has cleared is a real answer, and it must
    not be collateral damage from making the denied case honest."""

    class Clean(FakeMacie):
        def get_finding_statistics(self, groupBy, size=50):  # noqa: N803
            return {"countsByGroup": []}

        def list_findings(self, **kw):
            return {"findingIds": []}

    monkeypatch.setattr(macie_mod.boto3, "client", lambda *a, **k: Clean())
    r = macie_mod.GovernMacieService(region="us-east-1")._fetch_data_sensitivity()
    assert r.live is True
    assert r.total_findings == 0
    assert "no findings yet" in (r.note or "")


def test_macie_denied_statistics_is_not_live(monkeypatch):
    r = _macie(monkeypatch, deny_stats=("type",))
    assert r.live is False
    assert r.source == "macie2-partial"
    assert "GetFindingStatistics(type)" in (r.note or "")


def test_macie_denied_statistics_does_not_claim_no_findings(monkeypatch):
    """The specific sentence this fix exists to suppress.

    `total_findings` is 0 in this response because the read was denied, not because the
    account is clean, so the note must not read as a clean bill of health.
    """
    r = _macie(monkeypatch, deny_stats=("type", "severity.description"))
    note = r.note or ""
    assert "no findings yet" not in note
    assert "zero here does not mean" in note
    # Still reports what it did measure: the session really is ENABLED.
    assert r.macie_status == "ENABLED"


def test_macie_denied_sample_alone_is_not_live(monkeypatch):
    """ListFindings/GetFindings is a separate read from the statistics and degrades too."""
    r = _macie(monkeypatch, deny_sample=True)
    assert r.live is False
    assert "ListFindings/GetFindings" in (r.note or "")


# ───────────────────── Verified Permissions ─────────────────────


class FakeVP:
    """verifiedpermissions with one policy store and selectively denied enrichments.

    Deliberately no `get_paginator`: the service tries a paginator first and falls back to
    the single-shot call on AttributeError, so omitting it exercises the fallback path
    while keeping the fake small.
    """

    def __init__(self, deny=()):
        self.deny = set(deny)

    def list_policy_stores(self):
        return {"policyStores": [{"policyStoreId": "ps-1", "arn": "arn:aws:verifiedpermissions::111122223333:policy-store/ps-1"}]}

    def list_policies(self, policyStoreId):  # noqa: N803
        if "policies" in self.deny:
            raise _denied("ListPolicies")
        return {
            "policies": [
                {"effect": "permit", "policyType": "STATIC"},
                {"effect": "forbid", "policyType": "STATIC"},
            ]
        }

    def get_schema(self, policyStoreId):  # noqa: N803
        if "schema" in self.deny:
            raise _denied("GetSchema")
        if "schema_absent" in self.deny:
            raise ClientError(
                {"Error": {"Code": "ResourceNotFoundException", "Message": "no schema"}}, "GetSchema"
            )
        return {"schema": "{}", "namespaces": ["Ava"]}

    def list_identity_sources(self, policyStoreId):  # noqa: N803
        if "identity" in self.deny:
            raise _denied("ListIdentitySources")
        return {"identitySources": [{"identitySourceId": "is-1"}]}

    def get_policy_store(self, policyStoreId):  # noqa: N803
        if "metadata" in self.deny:
            raise _denied("GetPolicyStore")
        return {"cedarVersion": "CEDAR_2", "deletionProtection": "DISABLED"}


def _vp(monkeypatch, deny=()):
    fake = FakeVP(deny)
    monkeypatch.setattr(vp_mod.boto3, "client", lambda *a, **k: fake)
    return vp_mod.GovernVerifiedPermissionsService(region="us-east-1")._fetch_stores()


def test_vp_reads_that_all_succeed_are_live(monkeypatch):
    r = _vp(monkeypatch)
    assert r.live is True
    assert r.source == "verifiedpermissions"
    assert r.total_stores == 1
    assert r.total_policies == 2
    assert r.total_permit == 1 and r.total_forbid == 1
    assert r.stores_with_schema == 1
    assert r.total_identity_sources == 1


@pytest.mark.parametrize(
    "denied,expected_call",
    [
        ("policies", "verifiedpermissions:ListPolicies"),
        ("schema", "verifiedpermissions:GetSchema"),
        ("identity", "verifiedpermissions:ListIdentitySources"),
    ],
)
def test_vp_denied_enrichment_is_not_live_and_names_the_call(monkeypatch, denied, expected_call):
    """Each of the three content reads feeds a number the UI renders, so each one
    failing has to degrade the response - and say which one it was, because
    "0 policies" and "could not read the policies" look identical on screen."""
    r = _vp(monkeypatch, deny=(denied,))
    assert r.live is False
    assert r.source == "verifiedpermissions-partial"
    assert expected_call in (r.note or "")


def test_vp_denied_policies_does_not_restate_the_rollup(monkeypatch):
    """A permit/forbid rollup built from a denied ListPolicies is a fabricated 0/0.
    The note must not repeat it as though it were a finding about the store."""
    r = _vp(monkeypatch, deny=("policies",))
    note = r.note or ""
    assert "0 permit" not in note and "0 forbid" not in note


def test_vp_store_without_a_schema_stays_live(monkeypatch):
    """ResourceNotFoundException from GetSchema is a measurement: the store exists and has
    no schema attached. Treating it as a failed read would degrade every store that simply
    governs without a published schema."""
    r = _vp(monkeypatch, deny=("schema_absent",))
    assert r.live is True
    assert r.stores_with_schema == 0
    assert r.stores[0].schema_present is False


def test_vp_denied_metadata_earns_a_note_but_stays_live(monkeypatch):
    """GetPolicyStore only fills Optional fields (cedar_version, deletionProtection), which
    render as absent rather than as a number. That is a caveat, not a fabricated count, so
    it is tracked separately from the reads that force live=False."""
    r = _vp(monkeypatch, deny=("metadata",))
    assert r.live is True
    assert "GetPolicyStore" in (r.note or "")
    assert r.stores[0].cedar_version is None


def test_vp_list_policy_stores_denied_is_fully_unavailable(monkeypatch):
    """The establishing call. Nothing downstream is knowable, so this is not a partial."""

    class NoStores(FakeVP):
        def list_policy_stores(self):
            raise _denied("ListPolicyStores")

    monkeypatch.setattr(vp_mod.boto3, "client", lambda *a, **k: NoStores())
    r = vp_mod.GovernVerifiedPermissionsService(region="us-east-1")._fetch_stores()
    assert r.live is False
    assert r.source == "unavailable-fallback"
    assert r.total_stores == 0


def test_the_stub_seam_intercepts_every_client_and_carries_the_region(monkeypatch):
    """Guard on the harness, plus the region wiring.

    `macie_mod.boto3` is not a copy - it is the global `boto3` module object, so
    `monkeypatch.setattr(macie_mod.boto3, "client", ...)` above is process-wide for the
    duration of each test. That is what makes these tests credential-independent: no real
    client can be constructed, so none of them can reach AWS or behave differently
    depending on whose keys are in the environment.

    The region assertion rides along because it is cheap and it is the branch's other
    silent failure mode: a wrong-region read does not raise, it returns the wrong region's
    inventory. `_client()` must pass the region it was given, not a default.
    """
    assert macie_mod.boto3 is boto3

    seen = []

    def fake(service_name, **kw):
        seen.append((service_name, kw.get("region_name")))
        return FakeMacie()

    monkeypatch.setattr(macie_mod.boto3, "client", fake)
    r = macie_mod.GovernMacieService(region="eu-west-1")._fetch_data_sensitivity()
    assert seen == [("macie2", "eu-west-1")]
    assert r.live is True
