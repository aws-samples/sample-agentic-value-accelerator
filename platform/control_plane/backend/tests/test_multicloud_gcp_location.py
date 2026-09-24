"""Tests for `location` on the GCP connector - the value that reaches aiplatform.init.

What this file is and is not asserting, stated up front because the honest scope is narrower
than the rest of the multicloud validation suite:

`location` is admin-supplied on POST /api/v1/govern/multicloud/configure/gcp, stored in
ava/connectors/gcp, and handed to `google.cloud.aiplatform.init(location=...)`, where the
SDK derives the Vertex AI API endpoint host from it. It used to be stored exactly as
supplied - the request model carried a default but no pattern - which made it the one
caller-controlled value in this module still reaching a client library unchecked.

google-cloud-aiplatform is NOT installed in this environment. So nothing here demonstrates
that a hostile location redirects a request, and no test in this file claims to: the SDK
stand-in below records what it was handed and does no host construction at all. These are
defence-in-depth assertions - a bounded region-shaped token goes in, everything else is
refused with a 400 that names the grammar - not the proof of a closed vulnerability.

The three surfaces covered: the validator's grammar, the write boundary (a refused value is
never stored), and the read boundary (a row that predates the check, or one edited straight
into Secrets Manager, is refused before the SDK is even imported).
"""

from __future__ import annotations

import asyncio
import logging
import sys
import types

import pytest
from fastapi import HTTPException

import api.routes.multicloud as routes
from services import multicloud_connector_service as mc
from services.multicloud_connector_service import (
    InvalidConnectorIdentifierError,
    validate_gcp_location,
)


# --------------------------------------------------------------------------
# A. The grammar
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "location",
    [
        # Every shape a real GCP location takes today.
        "us-central1",
        "us-east4",
        "us-east5",
        "europe-west4",
        "europe-southwest1",
        "asia-northeast1",
        "asia-southeast2",
        "northamerica-northeast1",
        "southamerica-east1",
        "australia-southeast2",
        "me-central1",
        "me-west1",
        "africa-south1",
        # Multi-regions and the global endpoint, which are not "<word>-<word><digit>".
        "us",
        "eu",
        "asia",
        "global",
        # A region Google has not launched. This is the property an enumeration of today's
        # regions would fail: the pattern must not have to be edited to accept a new one.
        "mars-west1",
    ],
)
def test_real_and_future_region_shapes_are_accepted(location):
    assert validate_gcp_location(location) == location


def test_the_default_the_request_model_ships_is_accepted():
    """The check must not reject the value every configure call sends when the operator
    leaves the field alone."""
    default = routes.ConfigureGCPRequest.model_fields["location"].default

    assert default == "us-central1"
    assert validate_gcp_location(default) == default


def test_surrounding_whitespace_is_trimmed_and_the_trimmed_value_is_returned():
    """Validate one string and use another is how this class of check gets bypassed.

    A form field that arrives with a trailing newline is trimmed rather than refused, which
    is what validate_url_path_segment and validate_billing_export_table already do - but the
    value the caller must then store is the trimmed one, so it is what is returned.
    """
    assert validate_gcp_location("  us-central1\n") == "us-central1"
    assert validate_gcp_location("\teu ") == "eu"


@pytest.mark.parametrize(
    "location",
    [
        # A URL. The field is a token, and a token cannot carry a scheme or a host.
        "https://attacker.example.com",
        "http://169.254.169.254/latest/meta-data",
        "//attacker.example.com",
        # A slash: whatever the SDK builds from this, it is not one host label.
        "us-central1/../../v1/projects",
        "us-central1/foo",
        # A colon, i.e. a port or a scheme separator.
        "us-central1:8080",
        "attacker.example.com:443",
        # Dots. A location is one label; a dotted value is a hostname.
        "169.254.169.254",
        "attacker.example.com",
        "us-central1.attacker.example.com",
        # Whitespace, including the CR/LF that would be a header-injection primitive if the
        # value ever reached one.
        "us central1",
        "us\tcentral1",
        "us-\r\ncentral1",
        "   ",
        # Empty and absent.
        "",
        None,
        # Not a string at all: a JSON body can send these, and a TypeError 500 is not a
        # refusal.
        123,
        ["us-central1"],
        {"location": "us-central1"},
        # Over-long. Both branches: this one matches the pattern (three parts, each a legal
        # letter run) and is refused only by the length bound.
        "a" * 20 + "-" + "b" * 20,
        # And this one is over-long in a single part.
        "u" * 64,
        # Shapes that are near-misses rather than attacks, refused because the grammar is an
        # allowlist and not a search for bad characters.
        "US-CENTRAL1",
        "us_central1",
        "us--central1",
        "-us-central1",
        "us-central1-",
        "us-central1;",
        "us-central1%2f..",
        "*",
    ],
)
def test_everything_that_is_not_a_region_shaped_token_is_refused(location):
    with pytest.raises(InvalidConnectorIdentifierError):
        validate_gcp_location(location)


def test_a_zone_is_refused_and_that_is_deliberate():
    """Vertex AI's `location` is a region, so a zone-shaped value is not a location.

    Called out explicitly because it is the one plausible value this pattern refuses that a
    reader might expect to pass. If it ever turns out that a third part is needed, the fix is
    one more optional part in the pattern - not an enumeration of regions.
    """
    with pytest.raises(InvalidConnectorIdentifierError):
        validate_gcp_location("us-central1-a")


def test_the_rejection_names_the_field_and_the_grammar_and_not_the_value():
    """The message is returned to an HTTP caller and rendered in the UI."""
    payload = "https://attacker.example.com/latest/meta-data"

    with pytest.raises(InvalidConnectorIdentifierError) as exc:
        validate_gcp_location(payload)

    message = str(exc.value)
    assert "location" in message
    assert "us-central1" in message, "an operator needs to be told what a good value is"
    assert "attacker.example.com" not in message
    assert payload not in message


def test_the_field_name_in_the_message_is_the_callers_to_choose():
    """Same contract as validate_url_path_segment: the caller names the field it read."""
    with pytest.raises(InvalidConnectorIdentifierError) as exc:
        validate_gcp_location("nope!", "vertex_location")

    assert "vertex_location" in str(exc.value)


# --------------------------------------------------------------------------
# B. The write boundary - a refused location is never stored
# --------------------------------------------------------------------------


@pytest.fixture
def no_secret_writes(monkeypatch):
    """Record every Secrets Manager write instead of performing one.

    The point of validating before the write is that a refused value is never stored, so the
    test has to be able to say the store was not called at all.
    """
    written: list[tuple] = []

    def _save(name, value, region):
        written.append((name, value, region))
        return True

    monkeypatch.setattr(mc, "_save_secret", _save)
    return written


@pytest.mark.parametrize(
    "location",
    [
        "https://attacker.example.com",
        "us-central1/../../v1/projects",
        "us-central1:8080",
        "us central1",
        "us-\r\ncentral1",
        "a" * 20 + "-" + "b" * 20,
        "   ",
        "",
    ],
)
def test_configuring_gcp_with_a_bad_location_is_a_400_and_stores_nothing(
    no_secret_writes, location
):
    request = routes.ConfigureGCPRequest(
        project_id="proj", service_account_json="{}", location=location
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(routes.configure_gcp(request))

    assert exc.value.status_code == 400
    assert exc.value.detail.startswith("location must be")
    if location.strip():
        assert location.strip() not in exc.value.detail, "the 400 must not echo the value"
    assert no_secret_writes == [], "a refused location must never reach Secrets Manager"


def test_a_legitimate_location_is_still_stored(no_secret_writes):
    """The regression guard: the working integration must keep working."""
    request = routes.ConfigureGCPRequest(
        project_id="proj", service_account_json="{}", location="europe-west4"
    )

    result = asyncio.run(routes.configure_gcp(request))

    assert result.success is True
    name, value, _region = no_secret_writes[0]
    assert name == mc.GCP_SECRET_NAME
    assert value["location"] == "europe-west4"


def test_omitting_location_stores_the_model_default(no_secret_writes):
    """The field is optional, and leaving it out must not become a 400."""
    request = routes.ConfigureGCPRequest(project_id="proj", service_account_json="{}")

    result = asyncio.run(routes.configure_gcp(request))

    assert result.success is True
    assert no_secret_writes[0][1]["location"] == "us-central1"


def test_the_stored_location_is_the_trimmed_one(no_secret_writes):
    """What was validated is what gets stored, so the SDK cannot be handed the padded form."""
    request = routes.ConfigureGCPRequest(
        project_id="proj", service_account_json="{}", location="  asia-northeast1\n"
    )

    assert asyncio.run(routes.configure_gcp(request)).success is True
    assert no_secret_writes[0][1]["location"] == "asia-northeast1"


def test_a_bad_location_does_not_hide_behind_a_valid_project_id(no_secret_writes):
    """Both GCP fields raise the same exception type, so this checks the right one is named."""
    request = routes.ConfigureGCPRequest(
        project_id="example.com:legacy-proj",
        service_account_json="{}",
        billing_export_table="proj.billing_export.gcp_billing_export_v1",
        location="https://attacker.example.com",
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(routes.configure_gcp(request))

    assert exc.value.detail.startswith("location must be")
    assert "project_id" not in exc.value.detail
    assert no_secret_writes == []


# --------------------------------------------------------------------------
# C. The read boundary - stored rows predate the check
#
# The write boundary cannot speak for a row it did not write: anything stored before this
# check existed was never validated, and an operator editing ava/connectors/gcp in the
# Secrets Manager console is a normal ops action that applies no validation at all. So
# get_agents asks again, before the SDK is imported.
# --------------------------------------------------------------------------


@pytest.fixture
def fake_aiplatform(monkeypatch):
    """A stand-in google.cloud.aiplatform that records what init was handed.

    The real package is not installed here. That absence is why the exploitability question
    is open, and it is also why this fixture exists: without it the SDK import raises and
    every case in this section would go down the generic "GCP API error" path, which would
    make a refusal indistinguishable from an unavailable dependency.

    It deliberately does NOT construct an endpoint host. Asserting on a host built by a fake
    would be asserting on the fake.
    """
    inits: list[dict] = []

    def _init(project=None, location=None, credentials=None):
        inits.append({"project": project, "location": location})

    class _Endpoint:
        @staticmethod
        def list():
            return []

    aiplatform = types.ModuleType("google.cloud.aiplatform")
    aiplatform.init = _init
    aiplatform.Endpoint = _Endpoint

    cloud = types.ModuleType("google.cloud")
    cloud.aiplatform = aiplatform
    google = types.ModuleType("google")
    google.cloud = cloud

    monkeypatch.setitem(sys.modules, "google", google)
    monkeypatch.setitem(sys.modules, "google.cloud", cloud)
    monkeypatch.setitem(sys.modules, "google.cloud.aiplatform", aiplatform)
    return inits


def _gcp_with(monkeypatch, **creds) -> mc.GCPConnector:
    """A GCP connector whose secret is already in hand and whose key loads.

    `_get_gcp_credentials` is stubbed because this section is about `location`, not about the
    service account JSON, and building real google-auth credentials is impossible here.
    """
    connector = mc.GCPConnector(region="us-east-1")
    connector._credentials = {"project_id": "proj", "service_account_json": "{}", **creds}
    monkeypatch.setattr(connector, "_get_gcp_credentials", lambda: object())
    return connector


@pytest.mark.parametrize(
    "location",
    [
        "https://attacker.example.com",
        "us-central1/../../v1/projects",
        "us-central1:8080",
        "attacker.example.com",
        "us-\r\ncentral1",
    ],
)
def test_a_stored_hostile_location_never_reaches_the_sdk(monkeypatch, fake_aiplatform, location):
    connector = _gcp_with(monkeypatch, location=location)

    inventory = connector.get_agents()

    assert fake_aiplatform == [], "aiplatform.init must not be called with a refused location"
    assert inventory.live is False
    assert inventory.total == 0
    assert inventory.note.startswith("Stored GCP connector configuration rejected:")
    # Stored config, not the provider's fault, and no request was made.
    assert "GCP API error" not in inventory.note
    assert location not in inventory.note
    assert "attacker.example.com" not in inventory.note


def test_the_refusal_does_not_depend_on_the_sdk_being_installed(monkeypatch):
    """No fake_aiplatform here: this is the environment as it actually is.

    google-cloud-aiplatform is absent, so a check placed after the import would never run,
    and the refusal would arrive as "GCP API error: No module named ...". The validation sits
    before the import for exactly this reason.
    """
    connector = _gcp_with(monkeypatch, location="https://attacker.example.com")

    inventory = connector.get_agents()

    assert inventory.live is False
    assert inventory.note.startswith("Stored GCP connector configuration rejected:")
    assert "No module named" not in inventory.note


def test_a_refused_stored_location_is_logged_so_it_can_be_repaired(monkeypatch, caplog):
    """The response names the field and the grammar; only the log names the value.

    An operator cannot fix a stored value nobody will tell them about, and the value is not
    safe to return. It goes exactly one way, with %r, so an embedded CR/LF is escaped rather
    than forging a second log record.
    """
    connector = _gcp_with(monkeypatch, location="us-\r\ncentral1")

    with caplog.at_level(logging.WARNING, logger=mc.__name__):
        connector.get_agents()

    assert "location" in caplog.text
    assert "us-\\r\\ncentral1" in caplog.text, "repr escapes the CR/LF rather than emitting it"
    assert "us-\r\ncentral1" not in caplog.text


def test_a_legitimate_stored_location_is_passed_through_unchanged(monkeypatch, fake_aiplatform):
    """The other half: the guard must not break the inventory it protects."""
    connector = _gcp_with(monkeypatch, location="europe-west4")

    inventory = connector.get_agents()

    assert inventory.live is True
    assert fake_aiplatform == [{"project": "proj", "location": "europe-west4"}]


@pytest.mark.parametrize("stored", [{}, {"location": ""}, {"location": "   "}, {"location": "\n"}])
def test_a_missing_or_blank_stored_location_keeps_the_default(monkeypatch, fake_aiplatform, stored):
    """"Nothing stored" is not a bad value - it is a row written before the field existed.

    Blank counts as nothing stored for the same reason: it carries no choice of region.
    Refusing either would take a working connector offline over a field the operator never
    set, so the read boundary falls back to the same default the write boundary ships. A
    value that IS present and is not a region is still refused (above). The write boundary is
    stricter on purpose - an operator submitting a cleared field gets a 400 naming the
    grammar, which is a thing they can act on.
    """
    connector = _gcp_with(monkeypatch, **stored)

    inventory = connector.get_agents()

    assert inventory.live is True
    assert fake_aiplatform == [{"project": "proj", "location": "us-central1"}]


@pytest.mark.parametrize("stored", [123, ["us-central1"], {"region": "us-central1"}, True])
def test_a_stored_location_that_is_not_a_string_is_refused_not_defaulted(
    monkeypatch, fake_aiplatform, stored
):
    """A console edit can leave any JSON type here, and only blank means "unset".

    Falling back to the default for these would hand aiplatform.init a region the operator
    never chose while reporting live=True, and a TypeError from `.strip()` would surface as a
    generic "GCP API error".
    """
    connector = _gcp_with(monkeypatch, location=stored)

    inventory = connector.get_agents()

    assert fake_aiplatform == []
    assert inventory.live is False
    assert inventory.note.startswith("Stored GCP connector configuration rejected:")
    assert "GCP API error" not in inventory.note
