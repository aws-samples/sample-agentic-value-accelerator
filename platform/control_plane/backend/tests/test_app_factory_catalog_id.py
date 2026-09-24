"""Tests for App Factory catalog-ID assignment, where a race silently duplicated an ID.

Catalog ID assignment used to be read-then-write: scan for the highest NN under the
domain's prefix, add one, then put_item the submission. Two submissions in the same domain
that overlapped between the scan and the write therefore both computed the same highest+1
and both stored it. Neither overwrote the other - the pk is a per-submission uuid4 - so
both requests returned 201, and the duplicate surfaced only as two rows sharing the value
AppFactory.tsx labels "the authoritative identifier shown in the UI".

That is the failure mode this branch exists to stop: the wrong answer is the reassuring
one. A collision that 500s gets investigated; two 201s that quietly share an identifier get
believed.

`test_concurrent_claim_forces_the_next_id` is the load-bearing test - it is the one that
fails against the old read-then-write code, because the old code had nothing that could
detect the loser of the race. The negative tests matter just as much: a pk collision must
NOT be retried under a new catalog ID (`test_existing_submission_pk_is_409_and_not_retried`),
and exhausting the retry bound must refuse rather than issue a duplicate
(`test_exhaustion_refuses_rather_than_duplicating`).

Fakes rather than botocore's Stubber: what is under test is the branching on
CancellationReasons, which is positional (index 0 is the claim arm, index 1 the submission
arm) and which Stubber cannot express without hand-building the same error response anyway.
A scripted fake states the scenario in one line and lets each test assert the call count,
which is how "did it retry?" is actually observed.
"""

import pytest
from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import ClientError
from fastapi import HTTPException

import api.routes.app_factory as route

_deser = TypeDeserializer()


def _plain(item: dict) -> dict:
    """Low-level DynamoDB JSON back to Python natives, for assertions."""
    return {k: _deser.deserialize(v) for k, v in item.items()}


def _cancelled(*reasons: str) -> ClientError:
    """A TransactionCanceledException shaped the way botocore surfaces it.

    CancellationReasons sits at the TOP level of the error response, not under "Error",
    and arms that did not fail carry the literal string "None". Both details are load
    bearing: reading the list from the wrong place, or treating "None" as falsy-and-
    therefore-a-failure, silently changes which branch fires.
    """
    return ClientError(
        {
            "Error": {
                "Code": "TransactionCanceledException",
                "Message": "Transaction cancelled, please refer to CancellationReasons",
            },
            "CancellationReasons": [{"Code": r} for r in reasons],
        },
        "TransactWriteItems",
    )


_CCF = "ConditionalCheckFailedException"
_NONE = "None"


class _FakeClient:
    def __init__(self, outcomes=()):
        # Each entry is an exception to raise for that attempt; once exhausted, attempts
        # succeed. A test that wants every attempt to fail supplies enough entries.
        self._outcomes = list(outcomes)
        self.calls = []

    def transact_write_items(self, **kwargs):
        self.calls.append(kwargs)
        if self._outcomes:
            raise self._outcomes.pop(0)
        return {}


class _FakeTable:
    def __init__(self, pages=None, client=None):
        self.name = "test-app-factory"
        self.meta = type("_Meta", (), {"client": client or _FakeClient()})()
        self._pages = list(pages or [{"Items": []}])
        self.scans = []

    def scan(self, **kwargs):
        self.scans.append(kwargs)
        return self._pages[len(self.scans) - 1]


def _submission(sid="11111111-2222-3333-4444-555555555555") -> dict:
    return {
        "pk": f"SUBMISSION#{sid}",
        "sk": "META",
        "submission_id": sid,
        "created_at": "2026-09-15T00:00:00+00:00",
        "status": "pending",
        "domain": "Retail Banking",
        "use_case_name": "kyc-triage",
    }


# --------------------------------------------------------------------------------------
# _catalog_prefix / _scan_highest_catalog_nn
# --------------------------------------------------------------------------------------


def test_unmapped_domain_falls_back_to_other():
    assert route._catalog_prefix("Retail Banking") == "AB"
    assert route._catalog_prefix("Lending") == "AL"
    # "AX" is the prefix for "Other". A domain the map has never heard of is Other, and
    # that must stay a deliberate mapping rather than a KeyError.
    assert route._catalog_prefix("Underwater Basket Weaving") == "AX"
    assert route._catalog_prefix("") == "AX"


def test_empty_table_starts_at_one():
    table = _FakeTable([{"Items": []}])
    assert route._scan_highest_catalog_nn(table, "AB") == 0


def test_highest_wins_rather_than_the_count():
    """A gap must stay a gap. Deriving from len(items) re-issues a live ID."""
    table = _FakeTable([{"Items": [{"catalog_id": "AB01"}, {"catalog_id": "AB03"}]}])
    # Two items, so a count-based implementation would return 2 and the next submission
    # would be handed AB03 - which already exists.
    assert route._scan_highest_catalog_nn(table, "AB") == 3


def test_other_prefixes_are_not_counted():
    table = _FakeTable(
        [{"Items": [{"catalog_id": "AL07"}, {"catalog_id": "AB02"}, {"catalog_id": "AXFA88E4"}]}]
    )
    # AL07 belongs to Lending, and AXFA88E4 is one of the legacy fabricated IDs that does
    # not match the <PREFIX><NN> shape at all. Neither may influence Retail Banking.
    assert route._scan_highest_catalog_nn(table, "AB") == 2


def test_scan_pages_and_reads_strongly_consistently():
    table = _FakeTable(
        [
            {"Items": [{"catalog_id": "AB01"}], "LastEvaluatedKey": {"pk": "SUBMISSION#a"}},
            {"Items": [{"catalog_id": "AB09"}]},
        ]
    )
    assert route._scan_highest_catalog_nn(table, "AB") == 9
    assert len(table.scans) == 2
    assert table.scans[1]["ExclusiveStartKey"] == {"pk": "SUBMISSION#a"}
    # An eventually-consistent scan can miss a row written seconds ago, which proposes a
    # candidate that is already taken. The claim catches that now, but only at the cost of
    # a wasted transaction, so the strong read stays.
    assert all(s["ConsistentRead"] is True for s in table.scans)


# --------------------------------------------------------------------------------------
# _claim_catalog_id
# --------------------------------------------------------------------------------------


def test_claim_and_submission_land_in_one_transaction():
    client = _FakeClient()
    table = _FakeTable(client=client)

    assert route._claim_catalog_id(table, "AB", 1, _submission()) == "AB01"

    assert len(client.calls) == 1
    items = client.calls[0]["TransactItems"]
    assert len(items) == 2, "the claim and the submission must be one atomic write"

    claim = _plain(items[0]["Put"]["Item"])
    assert claim["pk"] == "CATALOG_ID#AB01"
    # sk="CLAIM", not "META": list_submissions() scans with FilterExpression sk = :sk for
    # "META", so a claim item must not be visible to it as a submission.
    assert claim["sk"] == "CLAIM"

    submission = _plain(items[1]["Put"]["Item"])
    assert submission["pk"] == "SUBMISSION#11111111-2222-3333-4444-555555555555"
    assert submission["sk"] == "META"
    assert submission["catalog_id"] == "AB01"

    # Both conditions are required. Without the one on the claim the ID is not exclusive;
    # without the one on the submission a PutItem upsert can silently replace a record.
    assert items[0]["Put"]["ConditionExpression"] == "attribute_not_exists(pk)"
    assert items[1]["Put"]["ConditionExpression"] == "attribute_not_exists(pk)"


def test_concurrent_claim_forces_the_next_id():
    """The race this whole change exists to close.

    Both requests scanned and computed AB01. The first one commits. The second one's claim
    arm fails its condition, so it must take AB02 - not return a second AB01 with a 201.
    """
    client = _FakeClient([_cancelled(_CCF, _NONE)])
    table = _FakeTable(client=client)

    assert route._claim_catalog_id(table, "AB", 1, _submission()) == "AB02"

    assert len(client.calls) == 2, "the loser of the race must retry, not give up or duplicate"
    assert _plain(client.calls[0]["TransactItems"][0]["Put"]["Item"])["pk"] == "CATALOG_ID#AB01"
    assert _plain(client.calls[1]["TransactItems"][0]["Put"]["Item"])["pk"] == "CATALOG_ID#AB02"
    # The submission written on the winning attempt carries the ID it actually claimed.
    assert _plain(client.calls[1]["TransactItems"][1]["Put"]["Item"])["catalog_id"] == "AB02"


def test_the_retry_is_what_prevents_the_duplicate(monkeypatch):
    """Proof that AB02 above comes from the retry rather than from the fake's bookkeeping.

    Cutting the bound to a single attempt removes the loop's ability to advance past a lost
    race, and the identical scenario then refuses. So the test above is asserting the
    recompute, not merely that a fake returned a string - and refusing is the only honest
    outcome once advancing is impossible. The pre-fix code had no third option: it could not
    detect the lost race at all, which is why it returned 201 with a duplicate.
    """
    monkeypatch.setattr(route, "_CATALOG_CLAIM_ATTEMPTS", 1)
    client = _FakeClient([_cancelled(_CCF, _NONE)])
    table = _FakeTable(client=client)

    with pytest.raises(HTTPException) as exc:
        route._claim_catalog_id(table, "AB", 1, _submission())

    assert exc.value.status_code == 503
    assert len(client.calls) == 1


def test_a_burst_of_claims_walks_forward_without_repeating():
    client = _FakeClient([_cancelled(_CCF, _NONE)] * 3)
    table = _FakeTable(client=client)

    assert route._claim_catalog_id(table, "AB", 5, _submission()) == "AB08"

    issued = [
        _plain(c["TransactItems"][0]["Put"]["Item"])["pk"] for c in client.calls
    ]
    assert issued == [
        "CATALOG_ID#AB05",
        "CATALOG_ID#AB06",
        "CATALOG_ID#AB07",
        "CATALOG_ID#AB08",
    ]
    assert len(set(issued)) == len(issued), "no ID may be attempted twice"


def test_existing_submission_pk_is_409_and_not_retried():
    """A pk collision is not contention, so bumping the catalog ID cannot fix it.

    Retrying here would spin to the attempt bound while the actual fault - a submission
    pk that already exists - never changes, and would report 503 (retry me) for something
    a retry cannot help.
    """
    client = _FakeClient([_cancelled(_NONE, _CCF)])
    table = _FakeTable(client=client)

    with pytest.raises(HTTPException) as exc:
        route._claim_catalog_id(table, "AB", 1, _submission())

    assert exc.value.status_code == 409
    assert len(client.calls) == 1, "a pk collision must fail fast, not walk the ID space"


def test_transaction_conflict_retries_the_same_id():
    """A conflict means undecided, not taken, so the ID must not be burned.

    If the other transaction goes on to commit, the next attempt sees
    ConditionalCheckFailedException and increments then. Incrementing here instead would
    skip an ID every time two requests merely brushed against each other.
    """
    client = _FakeClient([_cancelled("TransactionConflict", _NONE)])
    table = _FakeTable(client=client)

    assert route._claim_catalog_id(table, "AB", 1, _submission()) == "AB01"

    assert len(client.calls) == 2
    ids = [_plain(c["TransactItems"][0]["Put"]["Item"])["pk"] for c in client.calls]
    assert ids == ["CATALOG_ID#AB01", "CATALOG_ID#AB01"]


def test_exhaustion_refuses_rather_than_duplicating():
    client = _FakeClient([_cancelled(_CCF, _NONE)] * route._CATALOG_CLAIM_ATTEMPTS)
    table = _FakeTable(client=client)

    with pytest.raises(HTTPException) as exc:
        route._claim_catalog_id(table, "AB", 1, _submission())

    # 503, not 500: nothing is broken, the ID space for this prefix is contended and a
    # retry is the correct response. The submission was not saved either way.
    assert exc.value.status_code == 503
    assert len(client.calls) == route._CATALOG_CLAIM_ATTEMPTS


def test_unrelated_client_error_propagates():
    """Throttling and IAM failures are not the claim loop's business.

    They must reach create_submission's own handler, which turns them into a 500 naming a
    save failure, rather than being absorbed as "that ID was taken" and silently costing
    an ID per throttled request.
    """
    throttled = ClientError(
        {"Error": {"Code": "ProvisionedThroughputExceededException", "Message": "slow down"}},
        "TransactWriteItems",
    )
    client = _FakeClient([throttled])
    table = _FakeTable(client=client)

    with pytest.raises(ClientError) as exc:
        route._claim_catalog_id(table, "AB", 1, _submission())

    assert exc.value.response["Error"]["Code"] == "ProvisionedThroughputExceededException"
    assert len(client.calls) == 1


def test_claim_records_which_submission_took_the_id():
    """The claim is the audit trail for an ID, so it has to name its owner.

    A bare marker item would make a duplicate impossible but leave "which submission owns
    AB07?" unanswerable without scanning every row.
    """
    client = _FakeClient()
    table = _FakeTable(client=client)
    sub = _submission()

    route._claim_catalog_id(table, "AB", 7, sub)

    claim = _plain(client.calls[0]["TransactItems"][0]["Put"]["Item"])
    assert claim["submission_id"] == sub["submission_id"]
    assert claim["claimed_at"] == sub["created_at"]
    assert claim["catalog_id"] == "AB07"
