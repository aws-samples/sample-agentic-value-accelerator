"""Multi-Cloud Connector Service — Azure, GCP and SaaS cost/agent connectors.

Provides unified access to:
- Azure Cost Management API for spend data
- Azure AI Foundry for agent inventory
- GCP BigQuery billing export for spend data
- GCP Vertex AI for agent inventory
- ServiceNow AI Agent Studio for agent inventory
- Salesforce Agentforce for agent inventory
- Microsoft Copilot Studio (Power Platform) for agent inventory

Credentials stored in AWS Secrets Manager:
- ava/connectors/azure: {tenant_id, client_id, client_secret, subscription_id}
- ava/connectors/gcp: {project_id, service_account_json, location, billing_export_table?}
- ava/connectors/servicenow: {instance_url, client_id, client_secret}
- ava/connectors/salesforce: {client_id, client_secret, login_url}
- ava/connectors/copilot-studio: {tenant_id, client_id, client_secret, environment_id}

Each connector degrades gracefully: returns live=False with explanatory note
when credentials are missing or APIs fail.

Failure handling is symmetric with success: a rejected token exchange and a missing
secret are both cached with a decaying cool-off, so neither is re-attempted on every
poll. See _SecretsBackedConnector for the measurement that motivated it, and
auth_state() for what the service is allowed to claim about a connector.
"""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import date, datetime, timedelta, timezone
from typing import Optional, List, Dict, Any, NamedTuple, Tuple

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import BaseModel, Field

from core import safe_fetch
from core.safe_fetch import SafeFetchError

logger = logging.getLogger(__name__)

# Secret names in AWS Secrets Manager
# Cloud Service Providers
AZURE_SECRET_NAME = "ava/connectors/azure"
GCP_SECRET_NAME = "ava/connectors/gcp"
# SaaS Platforms
SERVICENOW_SECRET_NAME = "ava/connectors/servicenow"
SALESFORCE_SECRET_NAME = "ava/connectors/salesforce"
COPILOT_STUDIO_SECRET_NAME = "ava/connectors/copilot-studio"

# safe_fetch reasons that describe a network condition rather than a verdict on the URL,
# so they feed the transient cool-off. Everything else ("blocked_scheme",
# "blocked_link_local_address", ...) is a statement about the stored value, and only a
# new secret version can change it.
_TRANSIENT_FETCH_REASONS = frozenset({
    "fetch_timeout",
    "fetch_failed",
    "tls_error",
    # DNS can be broken for a host that is spelled correctly, so this re-probes.
    "unresolvable_host",
    # A 200 carrying a non-JSON body (a proxy error page, typically). requests raised
    # ValueError here and _mark_auth_error classified that as transient; keeping it
    # transient means this conversion does not change any cool-off length.
    "invalid_json_response",
})

# Refusals that describe the resolver rather than the URL. Tolerated at the write boundary
# only - see validate_connector_base_url's `require_resolvable`.
_RESOLUTION_FAILURE_REASONS = frozenset({"unresolvable_host"})

# safe_fetch reasons that are a verdict on the URL rather than on a response. Everything
# else non-transient ("response_too_large", "too_many_redirects") describes what came back,
# which is a different sentence to put in front of an operator.
_URL_VERDICT_REASONS = frozenset({"invalid_url", "unresolvable_address"})

# requests set these on every call; http.client sets neither (it adds only Host and
# Accept-Encoding), so the conversion would otherwise have made these calls UA-less, and
# the edge protections in front of a customer's ServiceNow or Salesforce tenant routinely
# 403 a request with no User-Agent. Deliberately a fixed string with no version substituted
# in: a tenant that allowlists this client should not have to re-allowlist it on a release.
_CONNECTOR_FETCH_HEADERS = {
    "User-Agent": "ava-control-plane",
    "Accept": "application/json",
}


# ─── Caller-supplied value validation ──────────────────────────────────────────

def validate_connector_base_url(url: Optional[str], *, require_resolvable: bool = True) -> str:
    """Validate a connector base URL that did not come from this process.

    Returns the URL with any trailing slash removed, which is the form every call site
    concatenates onto. Raises SafeFetchError: `reason` is a stable category safe to hand
    back to an HTTP caller, `detail` names the host and the address it resolved to and
    belongs only in a log.

    Every USE site calls this form, which answers one question - may this URL be fetched -
    and needs no second value. The write boundary calls `_validate_connector_base_url`
    instead, because a stored URL whose reachability was never measured has to be reported
    as such rather than as a verified one.

    `require_resolvable=False` keeps every structural check and every address verdict but
    tolerates a host that does not resolve *right now*. It is for the write boundary only.
    A resolver that is unavailable during a POST says nothing about whether the URL is one
    this platform will fetch, and treating it as a verdict refuses to store correct
    credentials until DNS comes back - a demo box with no egress DNS, an in-flight
    resolver outage, or an instance whose DNS has not propagated yet. Nothing is weakened:
    every use re-validates with require_resolvable=True and pins the address it connects
    to, so a name that never resolves fails at use time, honestly and visibly.

    Two distinct problems, both reachable here:

    1. SSRF. `instance_url` and `login_url` arrive in a request body and are stored, so
       without this an admin-gated form turns the backend into a fetcher for anything it
       can reach - the instance metadata service included. safe_fetch.validate_url is
       what refuses that, and it also pins the address the later fetch connects to.
    2. Suffix absorption. Every use is `f"{base}{fixed_path}"`, so a stored value ending
       in `?` makes the fixed path a query string ("https://host/x?" + "/oauth_token.do")
       and the supplied value chooses the whole endpoint rather than just the host. A base
       URL has no legitimate `?`, `#` or `;`, so all three are refused instead of quietly
       reinterpreted.

       That test is on the raw string and not on urlparse's fields on purpose: measured on
       this image's Python, urlparse("https://host/x?") reports query='' - the marker is
       gone from the parsed result while the absorption it enables is not. A `parts.query`
       check passes exactly the value that matters.
    """
    return _validate_connector_base_url(url, require_resolvable=require_resolvable)[0]


def _validate_connector_base_url(
    url: Optional[str], *, require_resolvable: bool = True
) -> Tuple[str, bool]:
    """As `validate_connector_base_url`, plus whether reachability was actually measured.

    Returns `(normalised_url, resolved)`. `resolved` is True when the hostname resolved and
    every address it resolved to passed safe_fetch's address checks - which is as far as
    this function goes; it opens no socket, so it is not a statement that the connector
    answered. False is only reachable with `require_resolvable=False`, and means exactly
    "the question was not answered": the resolver did not respond, so the URL was stored
    with its address verdict unknown.

    The second value exists so the write boundary can report which of those two things
    happened instead of describing both as success. Kept separate from the public function
    because every use site wants the URL and nothing else, and a two-tuple there would be
    unpacked-and-ignored noise at four call sites.
    """
    if not isinstance(url, str) or not url.strip():
        raise SafeFetchError("invalid_url", "empty connector URL")

    candidate = url.strip()
    if any(marker in candidate for marker in "?#;"):
        raise SafeFetchError("blocked_url_query_or_fragment", f"url={candidate}")

    resolved = True
    try:
        safe_fetch.validate_url(candidate)
    except SafeFetchError as exc:
        if require_resolvable or exc.reason not in _RESOLUTION_FAILURE_REASONS:
            raise
        # Tolerated, but not silently: the connector will report "unavailable" the first
        # time it is used, this is the line that explains why, and `resolved=False` is what
        # stops the API telling the operator the URL was verified. %r on the URL because it
        # is caller-supplied and an embedded CR/LF would otherwise forge a log record.
        resolved = False
        logger.warning(
            f"Connector URL {candidate!r} did not resolve at configure time ({exc.reason}); "
            f"storing it and validating again on use"
        )
    return candidate.rstrip("/"), resolved


class InvalidConnectorIdentifierError(ValueError):
    """A stored identifier that would not stay inside the URL path segment it is written to.

    Its message names the grammar, never the rejected value: it is returned to an HTTP
    caller and rendered in the UI.

    `location` (see validate_gcp_location) raises this type too, and is the one member of
    the set that is not interpolated into a URL by this module - it is handed to
    `aiplatform.init`, which derives an API endpoint host from it inside the SDK. The
    property they share is the narrower one: a caller-supplied connector config value that
    has to stay inside a tightly constrained grammar. The type is deliberately shared so
    every caller that already renders this message - `_reject_identifier` in
    api/routes/multicloud.py, and the "stored config rejected" branches here - covers the
    new field without a second except clause.
    """


# One path segment and nothing else. Letters, digits, dot, underscore, hyphen covers every
# real value for the fields this guards: a GUID tenant/subscription/environment id, an
# Azure AD domain tenant ("contoso.onmicrosoft.com"), and Power Platform's "Default-<guid>".
_URL_PATH_SEGMENT_RE = re.compile(r"[A-Za-z0-9._-]{1,128}")


def validate_url_path_segment(value: Optional[str], field: str) -> str:
    """Return `value` if it is a single URL path segment, else raise.

    These ids are interpolated into a URL whose host is a fixed literal, so this is not an
    SSRF gate. It is the suffix-absorption one: `f".../environments/{environment_id}?api-
    version=2022-05-01"` with an environment_id of "x?a=b#" reaches the wire as
    `/environments/x?a=b` - the fixed `?api-version` the API requires is gone, and with a
    `/` in the value the same interpolation reaches an arbitrary ARM path carrying this
    platform's management.azure.com bearer token.

    Called at BOTH boundaries: configure_azure / configure_gcp / configure_copilot_studio
    before the write, and `_SecretsBackedConnector._url_path_credential` at each
    interpolation. The write boundary alone cannot speak for a row it did not write - rows
    stored before this check existed, or edited straight into Secrets Manager - so the
    interpolation asks again. See `_url_path_credential`.
    """
    if not isinstance(value, str) or not value.strip():
        raise InvalidConnectorIdentifierError(f"{field} must be a non-empty string")

    candidate = value.strip()
    # `..` is one segment syntactically and "the parent" semantically, which is not an id.
    if not _URL_PATH_SEGMENT_RE.fullmatch(candidate) or not candidate.strip("."):
        raise InvalidConnectorIdentifierError(
            f"{field} must be a single identifier: letters, digits, dot, underscore and "
            f"hyphen only, with no '/', '?', '#' or whitespace"
        )
    return candidate


# A legacy domain-scoped GCP project id: "example.com:my-project". The part before the
# colon must contain a dot, which is what makes it a domain rather than an arbitrary word.
# That restriction is the point: a colon is legal in a URL path segment, but GCP also spells
# custom methods with one (`/v1/projects/{p}:someMethod`), so an unrestricted colon would
# let a stored project id select a method on the collection it is interpolated into.
_GCP_DOMAIN_SCOPED_PROJECT_RE = re.compile(
    r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+:[A-Za-z0-9._-]{1,128}"
)


def validate_gcp_project_id(value: Optional[str], field: str = "project_id") -> str:
    """Return `value` if it is a GCP project id that stays inside one URL path segment.

    `validate_url_path_segment` with one addition: the single colon a legacy domain-scoped
    project id carries. Rejecting that colon would have been a new dead end rather than a
    fix - `_BIGQUERY_TABLE_RE` deliberately accepts a "domain:" prefix, and the note in
    get_cost_summary for a DERIVED table exists precisely because the derived default
    inherits the colon from project_id. Refusing the id at the write boundary while the
    query path documents supporting it would lock a legacy project out of the connector
    entirely, so the two grammars agree instead.

    Nothing else is loosened: '/', '?', '#', whitespace and a bare `..` are still refused,
    which is the property the interpolation needs. Whether Google's Resource Manager API
    accepts a domain-scoped id in the `projects/{id}` path is not asserted here - that is
    the provider's answer to give, and this platform's job is only to send one path segment.
    """
    if isinstance(value, str) and _GCP_DOMAIN_SCOPED_PROJECT_RE.fullmatch(value.strip()):
        return value.strip()
    # Same message and same exception type as every other identifier, so a caller that
    # renders it does not need to know this field has a second accepted shape.
    return validate_url_path_segment(value, field)


# A GCP region or multi-region and nothing else: lowercase letters and digits in up to three
# hyphen-separated parts. Covers every current shape - "us-central1", "europe-west4",
# "asia-northeast1", "northamerica-northeast1", "me-central1", the bare multi-regions "us"
# and "eu", and "global".
#
# A pattern rather than an enumeration of today's regions, on purpose. An enumerated list is
# wrong the week Google launches a region, and its failure mode is refusing a location that
# works - the same dead end that made the domain-scoped project id a special case above. The
# pattern accepts regions that do not exist yet and rejects every shape that is not a
# region-like token, which is the only property this value has to have.
#
# Three parts, not two, because the segment count is not the property being enforced and a
# tighter count would be another guess about Google's naming. The digits are bounded at two
# and each letter run at twenty, which is what makes the whole token bounded even before
# _GCP_LOCATION_MAX_LEN.
_GCP_LOCATION_RE = re.compile(r"[a-z]{2,20}[0-9]{0,2}(?:-[a-z]{2,20}[0-9]{0,2}){0,2}")

# Real location names top out around 23 characters ("northamerica-northeast1"). 40 leaves
# room for a longer one than Google is known to have issued while keeping the value obviously
# bounded, which is the point: an unbounded token reaching a client library's endpoint
# construction is the thing being prevented. The letter and digit runs in the pattern bound
# it too; this is the bound a reader can check at a glance.
_GCP_LOCATION_MAX_LEN = 40


def validate_gcp_location(value: Optional[str], field: str = "location") -> str:
    """Return `value` if it is a GCP region or multi-region token, else raise.

    This is defence in depth, and the honest description of it is narrower than the other
    validators in this module. `location` is not interpolated into a URL by any code here:
    configure_gcp stores it and GCPConnector.get_agents passes it to `aiplatform.init`, and
    the SDK builds the regional Vertex AI endpoint host from it (Google documents those hosts
    as `<location>-aiplatform.googleapis.com`, but the SDK's own construction was not read -
    google-cloud-aiplatform is not installed in this environment). So what that construction
    does with a value carrying a scheme, a slash, a colon or a newline is NOT verified here,
    no exploit was attempted, let alone demonstrated, and this closes no proven
    vulnerability. What it does close is the gap that made the question interesting: an
    unbounded caller-controlled string was reaching a client-library initialiser unchecked,
    and now a bounded region-shaped token is.

    Raises InvalidConnectorIdentifierError so the existing 400 mapping in
    api/routes/multicloud.py (`_reject_identifier`) and the "stored config rejected"
    branches in this module cover it with no new plumbing. The message names the grammar and
    never the rejected value, which is caller-controlled text rendered in the UI.

    Surrounding whitespace is trimmed rather than refused, matching validate_url_path_segment
    and validate_billing_export_table, and the trimmed value is what is returned and stored -
    validating one string and using another is how this class of check gets bypassed.
    Whitespace anywhere inside the token is refused.
    """
    if not isinstance(value, str) or not value.strip():
        raise InvalidConnectorIdentifierError(f"{field} must be a non-empty string")

    candidate = value.strip()
    if len(candidate) > _GCP_LOCATION_MAX_LEN or not _GCP_LOCATION_RE.fullmatch(candidate):
        raise InvalidConnectorIdentifierError(
            f"{field} must be a GCP region or multi-region such as us-central1, "
            f"europe-west4 or eu: lowercase letters and digits in at most three "
            f"hyphen-separated parts and at most {_GCP_LOCATION_MAX_LEN} characters, with "
            f"no scheme, '/', ':', '?', '#' or whitespace"
        )
    return candidate


class InvalidBillingTableError(ValueError):
    """A BigQuery table name that is not a plain identifier.

    Its message is deliberately generic: it is returned to an HTTP caller and rendered in
    the UI, and the rejected value is attacker-controlled text. The value is logged at the
    call site instead.
    """


# project.dataset.table, or dataset.table when the client's own project is meant. Each
# part is letters, digits, underscore or hyphen; a dot is only ever a separator.
#
# An allowlist, not a denylist of backticks and semicolons, because this name is the one
# part of the billing query that cannot be a query parameter - the date bounds are real
# ScalarQueryParameters, the table name is string interpolation into `FROM`. A denylist
# would still admit whatever nobody thought of.
#
# The optional `domain:` prefix is a legacy domain-scoped project id ("example.com:proj"),
# which BigQuery writes inside these same backticks. Without it such a project is a dead
# end rather than a rejection: get_cost_summary's DERIVED default table would carry the
# colon too, so the note asking the operator to re-save the field would be asking them to
# re-save a value that cannot be spelled. A colon and dots inside backticks are still not
# an injection vector.
_BIGQUERY_TABLE_RE = re.compile(
    r"(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*:)?[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){1,2}"
)


def validate_billing_export_table(table: Optional[str]) -> str:
    """Return `table` if it is a bare BigQuery table identifier, else raise.

    Refuses rather than falling back to the default export table: a silent fallback would
    report a different table's numbers under the same live badge, which is exactly the
    failure this codebase keeps finding.
    """
    if not isinstance(table, str) or not table.strip():
        raise InvalidBillingTableError("billing_export_table must be a non-empty string")

    candidate = table.strip()
    if not _BIGQUERY_TABLE_RE.fullmatch(candidate):
        # Covers backticks, whitespace, semicolons, parens and -- / /* comment markers:
        # none of them are in the allowed character class.
        raise InvalidBillingTableError(
            "billing_export_table must be a BigQuery identifier of the form "
            "project.dataset.table (letters, digits, underscore and hyphen only)"
        )
    return candidate


def _json_body(response: safe_fetch.SafeResponse) -> Any:
    """Parse a fetched body, refusing one that hit safe_fetch's size cap.

    A truncated body is not the upstream's answer. Parsing it either fails - and
    "invalid_json_response" is in _TRANSIENT_FETCH_REASONS, so a permanent condition would
    re-probe forever without ever saying why - or, worse, succeeds on a shorter document
    and reports fewer agents than exist under a live badge. Both read as "the upstream
    returned less than it did", so this refuses instead, with its own non-transient reason.
    """
    if response.truncated:
        raise SafeFetchError("response_too_large", f"body exceeded the cap for {response.final_url}")
    return response.json()


# ─── Response Models ───────────────────────────────────────────────────────────

class MultiCloudCostItem(BaseModel):
    """Cost data for a single service/resource."""
    service: str
    amount: float
    currency: str = "USD"


class MultiCloudCostSummary(BaseModel):
    """Cost summary from a cloud provider."""
    provider: str
    total: float
    currency: str = "USD"
    period_start: str
    period_end: str
    by_service: List[MultiCloudCostItem] = Field(default_factory=list)
    live: bool
    source: str
    note: Optional[str] = None


class MultiCloudAgent(BaseModel):
    """Agent/model deployment from a cloud provider."""
    agent_id: str
    name: str
    provider: str
    status: str = "active"
    model: Optional[str] = None
    created_at: Optional[str] = None
    last_invoked: Optional[str] = None
    invocation_count: int = 0
    region: Optional[str] = None


class MultiCloudAgentInventory(BaseModel):
    """Agent inventory from a cloud provider."""
    provider: str
    agents: List[MultiCloudAgent] = Field(default_factory=list)
    total: int = 0
    live: bool
    source: str
    note: Optional[str] = None


class ConnectorStatus(BaseModel):
    """Status of a multi-cloud connector.

    `configured` and `connected` answer two different questions and must not be
    collapsed: `configured` means the secret was read and the required fields are
    non-empty (presence, which is measurable without touching the provider), while
    `connected` means the provider actually issued a token. A connector can be
    configured with credentials the provider rejects, which is why `auth_state`
    carries the measured outcome instead of leaving the UI to infer one.
    """
    provider: str
    label: str
    connected: bool
    configured: bool
    source: str
    detail: str
    last_sync: Optional[str] = None
    # Measured, never inferred: "unknown" | "ok" | "rejected" | "unavailable" |
    # "incomplete". See _SecretsBackedConnector.auth_state().
    auth_state: str = "unknown"
    auth_detail: Optional[str] = None


class TestConnectionResult(BaseModel):
    """Result of testing a connector's connection."""
    provider: str
    success: bool
    message: str
    details: Optional[Dict[str, Any]] = None
    latency_ms: Optional[int] = None
    tested_at: str


class MultiCloudConnectorsResponse(BaseModel):
    """Status of all multi-cloud connectors."""
    connectors: List[ConnectorStatus] = Field(default_factory=list)
    live: bool
    source: str = "multicloud-connectors"


class ConnectorWriteResult(NamedTuple):
    """What a configure_* call actually did. Replaces a bare bool.

    `saved` is the Secrets Manager write, which is all the bool used to say.

    `url_verified` is three-state on purpose, and none of the three is a guess:

      True   this connector has a URL and it resolved, with every address it resolved to
             passing the address checks. No socket was opened, so it is not a claim that
             the connector answered - only that the URL is one this platform will fetch.
      False  the URL was stored with that question unanswered. Reachable only through
             `require_resolvable=False`: DNS did not answer during the write, which is not
             a verdict on the URL, so the write is allowed and the caller is told.
      None   this connector has no URL for us to check (Azure, GCP, Copilot Studio: their
             hosts are fixed literals in this module).

    A bool with a default would have collapsed the last two, and the resulting response
    said "configured successfully" for a reachability check that never ran.
    """
    saved: bool
    url_verified: Optional[bool] = None


# ─── Secrets Manager Helper ────────────────────────────────────────────────────

def _get_secret(secret_name: str, region: str = "us-east-1") -> Optional[Dict[str, Any]]:
    """Retrieve a secret from AWS Secrets Manager."""
    try:
        client = boto3.client("secretsmanager", region_name=region)
        response = client.get_secret_value(SecretId=secret_name)
        secret_string = response.get("SecretString")
        if secret_string:
            return json.loads(secret_string)
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code == "ResourceNotFoundException":
            logger.info(f"Secret {secret_name} not found - connector not configured")
        else:
            logger.warning(f"Failed to retrieve secret {secret_name}: {e}")
    except (json.JSONDecodeError, BotoCoreError) as e:
        logger.warning(f"Failed to parse secret {secret_name}: {e}")
    return None


def _save_secret(secret_name: str, secret_data: Dict[str, Any], region: str = "us-east-1") -> bool:
    """Save a secret to AWS Secrets Manager."""
    try:
        client = boto3.client("secretsmanager", region_name=region)
        secret_string = json.dumps(secret_data)

        try:
            client.create_secret(Name=secret_name, SecretString=secret_string)
            logger.info(f"Created secret {secret_name}")
            return True
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") == "ResourceExistsException":
                client.update_secret(SecretId=secret_name, SecretString=secret_string)
                logger.info(f"Updated secret {secret_name}")
                return True
            raise
    except (ClientError, BotoCoreError) as e:
        logger.error(f"Failed to save secret {secret_name}: {e}")
        return False


# ─── Shared Connector Base ─────────────────────────────────────────────────────

# How long a REJECTED token exchange is remembered before the next caller is allowed to
# re-probe. A 400/401/403 from an OAuth client_credentials endpoint is a verdict, not a
# blip: invalid_request / invalid_client means the body or the credentials are wrong, and
# re-sending byte-identical form data can only fail identically. 900s caps a doomed
# connector at 4 outbound requests per hour (down from one per poll) while keeping
# recovery unattended - credentials repaired at 09:00 authenticate by 09:15 with no
# restart, and repairing them through Settings > Connectors or Test Connection clears the
# cool-off immediately (see invalidate_credentials).
_AUTH_REJECT_COOLOFF_SECONDS = 900

# How long a TRANSIENT failure is remembered. 429 and 5xx (and timeouts, DNS and TLS
# errors, which arrive as exceptions with no status at all) say nothing about the
# credentials, so the same request may well succeed next time. 60s matches
# _TABLE_RETRY_COOLDOWN_SECONDS in govern_operations_service and is roughly one poll
# cycle: long enough to stop amplifying a provider's own overload, short enough that a
# throttle or a network partition self-heals within a minute. Retrying a 400 on this
# cadence would be wrong, and retrying a 503 on the 900s cadence would be wasteful,
# which is why there are two windows rather than one.
_AUTH_TRANSIENT_COOLOFF_SECONDS = 60

# How long an absent (or unreadable) secret is remembered. Bounded for the same reason as
# above: a Secrets Manager throttle must not pin a connector to "not configured" for the
# process lifetime, and an unconfigured connector must not cost a GetSecretValue round
# trip on every is_configured()/is_connected() call.
_SECRET_MISS_COOLOFF_SECONDS = 60


class _SecretsBackedConnector:
    """Credential cache and token-request cool-off shared by every connector below.

    Only SUCCESS used to be cached, in two places, so both failure paths were re-run on
    every poll for as long as the process lived:

      * A rejected token exchange. `_get_access_token` stored the token and its expiry
        on HTTP 200 and stored nothing on anything else, so a 400 went back out on the
        very next call. Measured from `docker compose logs backend` over one 15-minute
        window against the demo account: six failed POSTs to
        login.microsoftonline.com for Azure and six for Copilot Studio, growing with
        traffic, each carrying identical form data that could only fail identically -
        plus six identical WARNING lines, which is exactly the near-duplicate spam that
        makes a real problem hard to see when the log is aggregated.

      * An absent secret. `_load_credentials` only assigned self._credentials when the
        read returned something, so a missing secret meant a fresh boto3 client and a
        GetSecretValue round trip (and an INFO line) on every single call - and
        get_connector_status calls into it several times per poll per connector.

    Both are cached here behind a cool-off that DECAYS rather than latches. A one-way
    latch is not an acceptable fix: this branch already had to remove one from
    govern_operations_service, where a single failure pinned the whole process to a
    degraded path until restart. All timing uses time.monotonic() so an NTP step cannot
    silently extend or skip a window, and success always clears a pending cool-off.

    Subclasses set `_label` (used in log lines and nothing else) and `_secret_names`,
    which is a tuple so Copilot Studio can express its documented fall back to the Azure
    secret declaratively instead of with a second read buried in a branch.
    """

    # Human-readable connector name for log lines.
    _label: str = "connector"
    # Secrets to try in order; the first one that reads non-empty wins.
    _secret_names: Tuple[str, ...] = ()

    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._credentials: Optional[Dict[str, Any]] = None
        self._credentials_missing_at: Optional[float] = None
        self._token: Optional[str] = None
        self._token_expires: Optional[datetime] = None
        # Tri-state auth health, deliberately not a boolean: None = no exchange has been
        # attempted with the credentials currently in hand, True = the provider issued a
        # token, False = the last exchange failed. Paired with _auth_failed_at so False
        # decays after _auth_cooloff_seconds instead of latching.
        self._auth_ok: Optional[bool] = None
        self._auth_failed_at: Optional[float] = None
        self._auth_cooloff_seconds: float = _AUTH_TRANSIENT_COOLOFF_SECONDS
        self._auth_failure_state: str = "unknown"
        self._auth_detail: Optional[str] = None
        self._auth_failures: int = 0

    # ── Credentials ───────────────────────────────────────────────────────────

    def _load_credentials(self) -> Optional[Dict[str, Any]]:
        """Load this connector's credentials from Secrets Manager, cached.

        A miss is cached too, for _SECRET_MISS_COOLOFF_SECONDS, so an unconfigured
        connector stops paying a Secrets Manager round trip per call. Never logs the
        secret's contents - only _get_secret's own name-level messages.
        """
        if self._credentials is not None:
            return self._credentials
        if self._credentials_missing_at is not None:
            if (time.monotonic() - self._credentials_missing_at) < _SECRET_MISS_COOLOFF_SECONDS:
                return None
        for secret_name in self._secret_names:
            secret = _get_secret(secret_name, self.region)
            if secret:
                self._credentials = secret
                self._credentials_missing_at = None
                return self._credentials
        self._credentials_missing_at = time.monotonic()
        return None

    def _url_path_credential(self, creds: Dict[str, Any], field: str, validator=None) -> str:
        """Read a stored credential that gets interpolated into a URL path, validating HERE.

        The write boundary (configure_azure / configure_gcp / configure_copilot_studio)
        validates these too, and that is not enough on its own for two reasons that are
        both true today:

          * Every row written before that check existed was never validated. The check
            cannot retroactively inspect a secret it did not write, and nothing rewrites
            those rows.
          * The configure endpoints are not the only writer. These secrets are documented
            at the top of this module as Secrets Manager entries, and an operator editing
            `ava/connectors/azure` in the console - a normal ops action - applies no
            validation at all.

        So the guard also runs at the interpolation, which is the place the value actually
        has to be one path segment. Same argument, and the same shape, as the second
        `validate_billing_export_table` call in GCPConnector.get_cost_summary.

        Raises InvalidConnectorIdentifierError, whose message names the field and the
        grammar and never the value. The value is logged here, once, with %r - repr escapes
        an embedded CR/LF, and an operator cannot fix a stored value nobody will name.
        """
        validate = validator or validate_url_path_segment
        try:
            return validate(creds.get(field), field)
        except InvalidConnectorIdentifierError:
            logger.warning(
                "%s: stored %s is not a single URL path segment (%r) - refusing to build a "
                "URL from it",
                self._label,
                field,
                creds.get(field),
            )
            raise

    def invalidate_credentials(self) -> None:
        """Forget everything learned about the current credentials.

        Called when the secret is rewritten and before an operator-triggered
        test_connection. Without this, the connector would keep using - and keep
        reporting the failure of - the credentials it read at start-up: the cache had no
        expiry at all, so a secret fixed through Settings > Connectors did not take
        effect until the process restarted.

        The auth state goes back to None ("not yet measured"), not to True. The old
        verdict is discarded because it described different credentials, and no new
        verdict is invented to replace it.
        """
        self._credentials = None
        self._credentials_missing_at = None
        self._token = None
        self._token_expires = None
        self._clear_auth_cooloff()

    # ── Token cool-off ────────────────────────────────────────────────────────

    def _cached_token(self) -> Optional[str]:
        """The cached bearer token if it is still inside its expiry window."""
        if self._token and self._token_expires and datetime.now(timezone.utc) < self._token_expires:
            return self._token
        return None

    def _should_attempt_auth(self) -> bool:
        """Whether an outbound token request should be made right now.

        False only during the cool-off window after a failure. Once the window has
        elapsed this returns True again so the next caller re-probes: a throttled
        endpoint, a brief network partition, or a credential fixed after the process
        started all recover on their own. Monotonic clock, so a clock step cannot move
        the window.
        """
        if self._auth_ok is not False:
            return True
        if self._auth_failed_at is None:
            return True
        return (time.monotonic() - self._auth_failed_at) >= self._auth_cooloff_seconds

    def _auth_suppressed(self) -> bool:
        """True when the cool-off is still running, so no request should go out.

        The suppressed attempts are logged at DEBUG on purpose. The transition into the
        failed state is the event worth a WARNING; every attempt behind it is the same
        news repeated, and repeating it is what buried this defect in the first place.
        """
        if self._should_attempt_auth():
            return False
        logger.debug(
            f"{self._label} token request suppressed - {self._auth_failure_state} "
            f"({self._auth_detail}), cooling off for {int(self._auth_cooloff_seconds)}s"
        )
        return True

    def _clear_auth_cooloff(self) -> None:
        """Allow the next caller to re-probe immediately, without claiming success."""
        if self._auth_ok is False:
            self._auth_ok = None
        self._auth_failed_at = None
        self._auth_cooloff_seconds = _AUTH_TRANSIENT_COOLOFF_SECONDS
        self._auth_failure_state = "unknown"
        self._auth_detail = None
        self._auth_failures = 0

    def _mark_auth_ok(self) -> None:
        """Record that the provider issued a token - clears any pending cool-off."""
        recovered = self._auth_ok is False
        self._auth_ok = True
        self._auth_failed_at = None
        self._auth_cooloff_seconds = _AUTH_TRANSIENT_COOLOFF_SECONDS
        self._auth_failure_state = "ok"
        self._auth_detail = None
        self._auth_failures = 0
        if recovered:
            logger.info(f"{self._label} authentication recovered")

    def _mark_auth_status(self, status_code: int) -> None:
        """Classify a non-200 from the token endpoint and start the right cool-off.

        Only 429 and 5xx are treated as retryable. Every other 4xx (400 invalid_request,
        401/403 invalid_client, 404 for a wrong tenant) is a verdict on the request
        itself, and no amount of repetition changes it.
        """
        retryable = status_code == 429 or status_code >= 500
        self._record_auth_failure(
            f"HTTP {status_code}",
            retryable=retryable,
            state="unavailable" if retryable else "rejected",
        )

    def _mark_auth_error(self, exc: BaseException) -> None:
        """Record a transport-level failure (timeout, DNS, TLS) as transient.

        Only the exception TYPE is recorded, never str(exc): this detail is returned to
        the UI, and the request that produced it carried a client_secret.
        """
        self._record_auth_failure(
            type(exc).__name__,
            retryable=True,
            state="unavailable",
        )

    def _mark_auth_fetch_error(self, exc: SafeFetchError) -> None:
        """Record a safe_fetch refusal or transport failure against the auth state.

        Only `exc.reason` is recorded. `exc.detail` carries the host and the address it
        resolved to, and this detail reaches the UI through ConnectorStatus.auth_detail -
        reporting a blocked target's address there would answer the question the refusal
        exists to refuse.

        A refusal is recorded as "incomplete", not "rejected", because nothing was sent:
        "rejected" renders as "rejected by the provider", and the provider never saw this
        request. The stored URL is what is unusable, and only a new secret version changes
        that, so it is also not retryable.

        A non-transient verdict on the RESPONSE ("response_too_large",
        "too_many_redirects") is a different sentence: the exchange did happen, so it is
        recorded as "rejected" and stated as itself rather than as a refused URL.
        """
        if exc.reason in _TRANSIENT_FETCH_REASONS:
            self._record_auth_failure(exc.reason, retryable=True, state="unavailable")
            return
        if exc.reason.startswith("blocked_") or exc.reason in _URL_VERDICT_REASONS:
            self._record_auth_failure(
                f"connector URL refused - {exc.reason}",
                retryable=False,
                state="incomplete",
            )
            return
        self._record_auth_failure(exc.reason, retryable=False, state="rejected")

    def _mark_auth_no_token(self) -> None:
        """Record a 200 response that carried no access_token.

        There is nothing cacheable in that response, so the expiry check cannot rate-limit
        it and the exchange would loop as fast as callers arrive. Non-retryable: a
        well-formed 200 with no token means the app registration or the requested scope is
        wrong, not that the endpoint hiccupped.
        """
        self._record_auth_failure(
            "HTTP 200 without access_token", retryable=False, state="rejected"
        )

    def _mark_auth_incomplete(self, detail: str = "credentials incomplete") -> None:
        """Record that required credential fields are absent.

        Nothing outbound happened, so there is no third-party traffic to rate-limit -
        but the WARNING was being re-emitted on every poll, and only a new secret
        version can change the answer. Treated as non-retryable for that reason.
        """
        self._record_auth_failure(detail, retryable=False, state="incomplete")

    def _record_auth_failure(self, detail: str, *, retryable: bool, state: str) -> None:
        first = self._auth_ok is not False
        self._auth_ok = False
        self._auth_failed_at = time.monotonic()
        self._auth_cooloff_seconds = (
            _AUTH_TRANSIENT_COOLOFF_SECONDS if retryable else _AUTH_REJECT_COOLOFF_SECONDS
        )
        self._auth_failure_state = state
        self._auth_detail = detail
        self._auth_failures += 1
        window = int(self._auth_cooloff_seconds)
        if first:
            logger.warning(
                f"{self._label} token request failed: {detail} ({state}, "
                f"{'retryable' if retryable else 'not retryable'}) - "
                f"suppressing further attempts for {window}s"
            )
        else:
            # Worded differently from the line above on purpose: reaching here means the
            # cool-off elapsed, a fresh request actually went out, and it failed again.
            logger.warning(
                f"{self._label} token request still failing after re-probe: {detail} "
                f"({state}, consecutive failures {self._auth_failures}) - "
                f"next re-probe in {window}s"
            )

    # ── Measured state ────────────────────────────────────────────────────────

    def auth_state(self) -> str:
        """The measured outcome of the last token exchange. Never a guess.

        "unknown"      no exchange has been attempted with the credentials in hand
        "ok"           the provider issued a token
        "rejected"     the provider refused the credentials (non-retryable status)
        "unavailable"  the provider could not be reached, or answered 429/5xx
        "incomplete"   required credential fields are absent, so nothing was sent

        Distinct from is_configured(), which only reports that the fields are present.
        A connector that has never authenticated is not connected, and this method
        exists so no caller has to pretend otherwise.
        """
        if self._auth_ok is None:
            return "unknown"
        if self._auth_ok:
            return "ok"
        return self._auth_failure_state

    def auth_detail(self) -> Optional[str]:
        """Short, credential-free description of the last auth failure, if any."""
        return self._auth_detail


# ─── Azure Connector ───────────────────────────────────────────────────────────

class AzureConnector(_SecretsBackedConnector):
    """Azure Cost Management + AI Foundry connector."""

    _label = "Azure"
    _secret_names = (AZURE_SECRET_NAME,)

    def _get_access_token(self) -> Optional[str]:
        """Get Azure AD access token using client credentials flow."""
        creds = self._load_credentials()
        if not creds:
            return None

        # Check if we have a valid cached token
        cached = self._cached_token()
        if cached:
            return cached

        # Success was rate-limited by the expiry above and failure was not, so a
        # rejected exchange went back out on every poll. See _SecretsBackedConnector.
        if self._auth_suppressed():
            return None

        tenant_id = creds.get("tenant_id")
        client_id = creds.get("client_id")
        client_secret = creds.get("client_secret")

        if not all([tenant_id, client_id, client_secret]):
            self._mark_auth_incomplete("tenant_id, client_id or client_secret missing")
            return None

        try:
            tenant_id = self._url_path_credential(creds, "tenant_id")
        except InvalidConnectorIdentifierError:
            # Recorded like any other unusable credential: "incomplete" because nothing was
            # sent, and non-retryable because only a new secret version can change it. The
            # detail names the field and not the value - it reaches the UI through
            # ConnectorStatus.auth_detail.
            self._mark_auth_incomplete("stored tenant_id is not a single URL path segment")
            return None

        try:
            import requests

            token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
            response = requests.post(token_url, data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": "https://management.azure.com/.default",
            }, timeout=10)

            if response.status_code == 200:
                data = response.json()
                token = data.get("access_token")
                if not token:
                    self._mark_auth_no_token()
                    return None
                self._token = token
                expires_in = data.get("expires_in", 3600)
                self._token_expires = datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)
                self._mark_auth_ok()
                return self._token
            self._mark_auth_status(response.status_code)
        except Exception as e:
            self._mark_auth_error(e)
        return None

    def is_configured(self) -> bool:
        """Whether the Azure credential FIELDS are present - not whether they work.

        Presence is measurable without touching Azure, and that is all this reports: it
        stays True for a service principal Azure AD rejects. Callers that need to know
        whether the credentials actually authenticate must use is_connected() or
        auth_state(); a UI that renders this alone will label a permanently failing
        connector "configured" forever.
        """
        creds = self._load_credentials()
        return creds is not None and all([
            creds.get("tenant_id"),
            creds.get("client_id"),
            creds.get("client_secret"),
            creds.get("subscription_id"),
        ])

    def is_connected(self) -> bool:
        """Whether Azure issued a usable token, as last measured.

        During a cool-off this answers from the recorded failure instead of re-sending a
        request that just failed, so it is "the last measurement said no", never a guess.
        """
        return self._get_access_token() is not None

    def test_connection(self) -> TestConnectionResult:
        """Test Azure connection and return detailed result."""
        # An operator-triggered test reports tested_at = now, so it must measure the
        # credentials as they are NOW: re-read the secret and drop any cool-off, or a
        # secret repaired seconds ago would be reported as still failing.
        self.invalidate_credentials()
        start_time = time.time()
        tested_at = datetime.now(timezone.utc).isoformat()

        if not self.is_configured():
            return TestConnectionResult(
                provider="azure",
                success=False,
                message="Not configured. Add Azure service principal credentials.",
                tested_at=tested_at,
            )

        try:
            import requests
            creds = self._load_credentials()
            # This test builds its own token and subscription URLs rather than going through
            # _get_access_token, so it has to re-validate both stored ids itself.
            tenant_id = self._url_path_credential(creds, "tenant_id")
            client_id = creds.get("client_id")
            client_secret = creds.get("client_secret")
            subscription_id = self._url_path_credential(creds, "subscription_id")

            # Test OAuth token acquisition
            token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
            token_response = requests.post(token_url, data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": "https://management.azure.com/.default",
            }, timeout=10)

            if token_response.status_code != 200:
                # This test bypasses _get_access_token, so it has to feed the same state
                # machine - otherwise the connector would keep polling on the old cadence
                # after a test had already measured the rejection.
                self._mark_auth_status(token_response.status_code)
                error_desc = "Unknown error"
                try:
                    error_desc = token_response.json().get("error_description", error_desc)
                except ValueError:
                    # Non-JSON body (a proxy error page, for instance). Falling through
                    # to the generic handler below would report a JSON parse error as the
                    # connection failure, which is not what happened.
                    pass
                return TestConnectionResult(
                    provider="azure",
                    success=False,
                    message=f"Authentication failed: {error_desc[:100]}",
                    details={
                        "status_code": token_response.status_code,
                        "error": "token_acquisition_failed",
                        "auth_state": self.auth_state(),
                    },
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )

            token = token_response.json().get("access_token")
            if token:
                self._mark_auth_ok()

            # Test subscription access
            sub_url = f"https://management.azure.com/subscriptions/{subscription_id}?api-version=2022-12-01"
            sub_response = requests.get(sub_url, headers={"Authorization": f"Bearer {token}"}, timeout=10)

            if sub_response.status_code == 200:
                sub_data = sub_response.json()
                return TestConnectionResult(
                    provider="azure",
                    success=True,
                    message=f"Connected to subscription: {sub_data.get('displayName', subscription_id)}",
                    details={
                        "subscription_id": subscription_id,
                        "subscription_name": sub_data.get("displayName"),
                        "state": sub_data.get("state"),
                    },
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )
            else:
                return TestConnectionResult(
                    provider="azure",
                    success=False,
                    message=f"Subscription access denied. Check permissions for subscription {subscription_id}.",
                    details={"status_code": sub_response.status_code, "error": "subscription_access_denied"},
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )

        except requests.exceptions.Timeout:
            return TestConnectionResult(
                provider="azure",
                success=False,
                message="Connection timed out. Check network connectivity.",
                details={"error": "timeout"},
                latency_ms=int((time.time() - start_time) * 1000),
                tested_at=tested_at,
            )
        except InvalidConnectorIdentifierError as e:
            # A verdict on stored configuration, not on Azure. Reporting it as "Connection
            # failed" would send the operator to check network and permissions for a value
            # this platform refused to put in a URL. `e` names the field and the grammar;
            # the value was logged by _url_path_credential and stays out of the response.
            return TestConnectionResult(
                provider="azure",
                success=False,
                message=f"Stored connector configuration rejected: {e}. Re-save it in "
                        f"Settings > Connectors.",
                details={"error": "invalid_stored_identifier"},
                latency_ms=int((time.time() - start_time) * 1000),
                tested_at=tested_at,
            )
        except Exception as e:
            return TestConnectionResult(
                provider="azure",
                success=False,
                message=f"Connection failed: {str(e)[:100]}",
                details={"error": str(type(e).__name__)},
                latency_ms=int((time.time() - start_time) * 1000),
                tested_at=tested_at,
            )

    def get_cost_summary(self, days: int = 30) -> MultiCloudCostSummary:
        """Get Azure cost summary from Cost Management API."""
        today = date.today()
        start = today - timedelta(days=days)

        if not self.is_configured():
            return MultiCloudCostSummary(
                provider="azure",
                total=0,
                period_start=start.isoformat(),
                period_end=today.isoformat(),
                live=False,
                source="azure-cost-management",
                note="Azure connector not configured. Add credentials in Settings > Connectors.",
            )

        token = self._get_access_token()
        if not token:
            return MultiCloudCostSummary(
                provider="azure",
                total=0,
                period_start=start.isoformat(),
                period_end=today.isoformat(),
                live=False,
                source="azure-cost-management",
                note="Azure authentication failed. Check credentials.",
            )

        try:
            import requests

            creds = self._load_credentials()
            subscription_id = self._url_path_credential(creds, "subscription_id")

            # Azure Cost Management Query API
            url = f"https://management.azure.com/subscriptions/{subscription_id}/providers/Microsoft.CostManagement/query?api-version=2023-11-01"

            query = {
                "type": "ActualCost",
                "timeframe": "Custom",
                "timePeriod": {
                    "from": start.isoformat(),
                    "to": today.isoformat(),
                },
                "dataset": {
                    "granularity": "None",
                    "aggregation": {
                        "totalCost": {"name": "Cost", "function": "Sum"}
                    },
                    "grouping": [
                        {"type": "Dimension", "name": "ServiceName"}
                    ],
                },
            }

            response = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json=query,
                timeout=30,
            )

            if response.status_code == 200:
                data = response.json()
                rows = data.get("properties", {}).get("rows", [])
                columns = data.get("properties", {}).get("columns", [])

                # Find cost and service name column indices
                cost_idx = next((i for i, c in enumerate(columns) if c.get("name") == "Cost"), 0)
                service_idx = next((i for i, c in enumerate(columns) if c.get("name") == "ServiceName"), 1)

                by_service = []
                total = 0.0
                for row in rows:
                    cost = float(row[cost_idx]) if len(row) > cost_idx else 0
                    service = row[service_idx] if len(row) > service_idx else "Unknown"
                    if cost > 0:
                        by_service.append(MultiCloudCostItem(service=service, amount=round(cost, 2)))
                        total += cost

                by_service.sort(key=lambda x: x.amount, reverse=True)

                return MultiCloudCostSummary(
                    provider="azure",
                    total=round(total, 2),
                    period_start=start.isoformat(),
                    period_end=today.isoformat(),
                    by_service=by_service[:10],  # Top 10 services
                    live=True,
                    source="azure-cost-management",
                )
            else:
                logger.warning(f"Azure Cost Management API failed: {response.status_code} - {response.text[:200]}")
                return MultiCloudCostSummary(
                    provider="azure",
                    total=0,
                    period_start=start.isoformat(),
                    period_end=today.isoformat(),
                    live=False,
                    source="azure-cost-management",
                    note=f"Azure API error: {response.status_code}",
                )

        except InvalidConnectorIdentifierError as e:
            # Not folded into the handler below, for the same reason the GCP billing-table
            # verdict is not: this is stored config, and "Azure API error" points the reader
            # at the wrong system. No request was sent.
            return MultiCloudCostSummary(
                provider="azure",
                total=0,
                period_start=start.isoformat(),
                period_end=today.isoformat(),
                live=False,
                source="azure-cost-management",
                note=f"Stored Azure connector configuration rejected: {e}. Re-save it in "
                     f"Settings > Connectors.",
            )

        except Exception as e:
            logger.warning(f"Azure cost query failed: {e}")
            return MultiCloudCostSummary(
                provider="azure",
                total=0,
                period_start=start.isoformat(),
                period_end=today.isoformat(),
                live=False,
                source="azure-cost-management",
                note=f"Azure API error: {str(e)[:100]}",
            )

    def get_agents(self) -> MultiCloudAgentInventory:
        """Get Azure AI Foundry agent inventory."""
        if not self.is_configured():
            return MultiCloudAgentInventory(
                provider="azure",
                live=False,
                source="azure-ai-foundry",
                note="Azure connector not configured.",
            )

        token = self._get_access_token()
        if not token:
            return MultiCloudAgentInventory(
                provider="azure",
                live=False,
                source="azure-ai-foundry",
                note="Azure authentication failed.",
            )

        try:
            import requests

            creds = self._load_credentials()
            subscription_id = self._url_path_credential(creds, "subscription_id")

            # List Azure OpenAI deployments
            url = f"https://management.azure.com/subscriptions/{subscription_id}/providers/Microsoft.CognitiveServices/accounts?api-version=2023-05-01"

            response = requests.get(
                url,
                headers={"Authorization": f"Bearer {token}"},
                timeout=30,
            )

            agents = []
            if response.status_code == 200:
                accounts = response.json().get("value", [])
                openai_accounts = 0
                unreadable_accounts = 0
                for account in accounts:
                    if account.get("kind") == "OpenAI":
                        openai_accounts += 1
                        # Get deployments for this account
                        account_name = account.get("name")
                        rg = account.get("id", "").split("/resourceGroups/")[1].split("/")[0] if "/resourceGroups/" in account.get("id", "") else ""

                        deployments_url = f"https://management.azure.com/subscriptions/{subscription_id}/resourceGroups/{rg}/providers/Microsoft.CognitiveServices/accounts/{account_name}/deployments?api-version=2023-05-01"
                        dep_response = requests.get(
                            deployments_url,
                            headers={"Authorization": f"Bearer {token}"},
                            timeout=30,
                        )

                        if dep_response.status_code == 200:
                            deployments = dep_response.json().get("value", [])
                            for dep in deployments:
                                agents.append(MultiCloudAgent(
                                    agent_id=dep.get("name", "unknown"),
                                    name=dep.get("name", "Unknown"),
                                    provider="azure",
                                    status="active" if dep.get("properties", {}).get("provisioningState") == "Succeeded" else "pending",
                                    model=dep.get("properties", {}).get("model", {}).get("name"),
                                    region=account.get("location"),
                                ))
                        else:
                            # A failed deployment listing is not the same fact as "this
                            # account has no deployments". Swallowing it silently shrank
                            # the inventory under live=True, so the caller saw a smaller
                            # fleet with nothing to indicate the count was partial.
                            unreadable_accounts += 1

                note = None
                if unreadable_accounts:
                    # One aggregate line per call rather than one per account: the point
                    # is that the count is incomplete, not which account failed first.
                    logger.warning(
                        f"Azure deployment listing failed for {unreadable_accounts} of "
                        f"{openai_accounts} Azure OpenAI accounts"
                    )
                    note = (
                        f"{unreadable_accounts} of {openai_accounts} Azure OpenAI accounts "
                        f"could not be enumerated, so this count is incomplete."
                    )

                # An empty list here with every account readable is a measured zero, and
                # stays live=True: the API answered, it just has nothing deployed.
                return MultiCloudAgentInventory(
                    provider="azure",
                    agents=agents,
                    total=len(agents),
                    live=True,
                    source="azure-ai-foundry",
                    note=note,
                )
            else:
                return MultiCloudAgentInventory(
                    provider="azure",
                    live=False,
                    source="azure-ai-foundry",
                    note=f"Azure API error: {response.status_code}",
                )

        except InvalidConnectorIdentifierError as e:
            return MultiCloudAgentInventory(
                provider="azure",
                live=False,
                source="azure-ai-foundry",
                note=f"Stored Azure connector configuration rejected: {e}. Re-save it in "
                     f"Settings > Connectors.",
            )

        except Exception as e:
            logger.warning(f"Azure agent inventory failed: {e}")
            return MultiCloudAgentInventory(
                provider="azure",
                live=False,
                source="azure-ai-foundry",
                note=f"Azure API error: {str(e)[:100]}",
            )


# ─── GCP Connector ─────────────────────────────────────────────────────────────

class GCPConnector(_SecretsBackedConnector):
    """Google Cloud Billing + Vertex AI connector.

    Inherits the credential cache and its invalidation, but not the token cool-off:
    google-auth builds credentials from the service account key locally, so a bad key
    costs a JSON parse rather than an outbound request, and there is nothing to
    rate-limit. is_connected() therefore re-measures on every call, which is why the
    status detail for GCP can describe a key failure as freshly measured.
    """

    _label = "GCP"
    _secret_names = (GCP_SECRET_NAME,)

    def is_configured(self) -> bool:
        """Whether the GCP credential FIELDS are present - not whether they work.

        Same caveat as AzureConnector.is_configured: presence only. A malformed service
        account key still reports True here; is_connected() is what measures it.
        """
        creds = self._load_credentials()
        return creds is not None and all([
            creds.get("project_id"),
            creds.get("service_account_json") or creds.get("private_key"),
        ])

    def _get_gcp_credentials(self):
        """Get Google Cloud credentials object."""
        creds = self._load_credentials()
        if not creds:
            return None

        try:
            from google.oauth2 import service_account

            # Handle both full service account JSON and individual fields
            if creds.get("service_account_json"):
                sa_info = json.loads(creds["service_account_json"])
            else:
                sa_info = creds

            return service_account.Credentials.from_service_account_info(
                sa_info,
                scopes=[
                    "https://www.googleapis.com/auth/cloud-billing.readonly",
                    "https://www.googleapis.com/auth/cloud-platform.read-only",
                ],
            )
        except Exception as e:
            logger.warning(f"GCP credentials error: {e}")
            return None

    def is_connected(self) -> bool:
        """Whether the service account key loads. Measured locally on every call."""
        return self._get_gcp_credentials() is not None

    def test_connection(self) -> TestConnectionResult:
        """Test GCP connection and return detailed result."""
        # Operator-triggered test: re-read the secret so a key pasted seconds ago is the
        # one being tested, not the one cached at start-up.
        self.invalidate_credentials()
        start_time = time.time()
        tested_at = datetime.now(timezone.utc).isoformat()

        if not self.is_configured():
            return TestConnectionResult(
                provider="gcp",
                success=False,
                message="Not configured. Add GCP service account credentials.",
                tested_at=tested_at,
            )

        try:
            credentials = self._get_gcp_credentials()
            if not credentials:
                return TestConnectionResult(
                    provider="gcp",
                    success=False,
                    message="Invalid service account JSON. Check the key format.",
                    details={"error": "invalid_credentials"},
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )

            creds = self._load_credentials()
            # Interpolated into the Resource Manager URL below, so it is validated here as
            # well as in configure_gcp - see _url_path_credential for why the write boundary
            # cannot speak for a secret it did not write.
            project_id = self._url_path_credential(creds, "project_id", validate_gcp_project_id)

            # Test project access using Resource Manager API
            import requests
            from google.auth.transport.requests import Request

            credentials.refresh(Request())
            token = credentials.token

            project_url = f"https://cloudresourcemanager.googleapis.com/v1/projects/{project_id}"
            response = requests.get(project_url, headers={"Authorization": f"Bearer {token}"}, timeout=10)

            if response.status_code == 200:
                project_data = response.json()
                return TestConnectionResult(
                    provider="gcp",
                    success=True,
                    message=f"Connected to project: {project_data.get('name', project_id)}",
                    details={
                        "project_id": project_id,
                        "project_name": project_data.get("name"),
                        "project_number": project_data.get("projectNumber"),
                        "lifecycle_state": project_data.get("lifecycleState"),
                    },
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )
            elif response.status_code == 403:
                return TestConnectionResult(
                    provider="gcp",
                    success=False,
                    message=f"Permission denied. Grant 'Viewer' role to the service account for project {project_id}.",
                    details={"status_code": 403, "error": "permission_denied"},
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )
            else:
                return TestConnectionResult(
                    provider="gcp",
                    success=False,
                    message=f"Project access failed with status {response.status_code}.",
                    details={"status_code": response.status_code},
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )

        except InvalidConnectorIdentifierError as e:
            # Stored config, not a GCP failure, and no request was sent. `e` names the field
            # and the grammar; _url_path_credential logged the value.
            return TestConnectionResult(
                provider="gcp",
                success=False,
                message=f"Stored connector configuration rejected: {e}. Re-save it in "
                        f"Settings > Connectors.",
                details={"error": "invalid_stored_identifier"},
                latency_ms=int((time.time() - start_time) * 1000),
                tested_at=tested_at,
            )
        except Exception as e:
            return TestConnectionResult(
                provider="gcp",
                success=False,
                message=f"Connection failed: {str(e)[:100]}",
                details={"error": str(type(e).__name__)},
                latency_ms=int((time.time() - start_time) * 1000),
                tested_at=tested_at,
            )

    def get_cost_summary(self, days: int = 30) -> MultiCloudCostSummary:
        """Get GCP cost summary from Cloud Billing API."""
        today = date.today()
        start = today - timedelta(days=days)

        if not self.is_configured():
            return MultiCloudCostSummary(
                provider="gcp",
                total=0,
                period_start=start.isoformat(),
                period_end=today.isoformat(),
                live=False,
                source="gcp-billing",
                note="GCP connector not configured. Add credentials in Settings > Connectors.",
            )

        credentials = self._get_gcp_credentials()
        if not credentials:
            return MultiCloudCostSummary(
                provider="gcp",
                total=0,
                period_start=start.isoformat(),
                period_end=today.isoformat(),
                live=False,
                source="gcp-billing",
                note="GCP authentication failed. Check service account credentials.",
            )

        stored_table = None
        billing_table = None
        try:
            creds = self._load_credentials()
            project_id = creds.get("project_id")
            stored_table = creds.get("billing_export_table")
            # `or`, not a dict default: a stored key holding "" is "not set", and passing
            # it through produced `FROM ``` and a BigQuery syntax error.
            billing_table = stored_table or f"{project_id}.billing_export.gcp_billing_export_v1"
            # Validated here as well as in the configure route, because config stored
            # before that check still exists and this is the interpolation itself. Before
            # the client is built, so a rejected table costs no connection.
            #
            # The return value is assigned back: it is the normalised (stripped) form, and
            # the FROM clause below has to interpolate the exact string that was validated.
            # A stored "\n proj.dataset.table \n" otherwise passed the guard and emitted a
            # malformed quoted identifier, which surfaced as a generic GCP API error.
            billing_table = validate_billing_export_table(billing_table)

            from google.cloud import bigquery

            client = bigquery.Client(credentials=credentials, project=project_id)

            query = f"""
                SELECT
                    service.description as service,
                    SUM(cost) as cost
                FROM `{billing_table}`
                WHERE DATE(usage_start_time) >= @start_date
                  AND DATE(usage_start_time) < @end_date
                GROUP BY service.description
                ORDER BY cost DESC
                LIMIT 10
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("start_date", "DATE", start.isoformat()),
                    bigquery.ScalarQueryParameter("end_date", "DATE", today.isoformat()),
                ]
            )

            results = client.query(query, job_config=job_config).result()

            by_service = []
            total = 0.0
            for row in results:
                cost = float(row.cost) if row.cost else 0
                if cost > 0:
                    by_service.append(MultiCloudCostItem(service=row.service, amount=round(cost, 2)))
                    total += cost

            return MultiCloudCostSummary(
                provider="gcp",
                total=round(total, 2),
                period_start=start.isoformat(),
                period_end=today.isoformat(),
                by_service=by_service,
                live=True,
                source="gcp-billing-bigquery",
            )

        except InvalidBillingTableError as e:
            # Not folded into the handler below: this is a verdict on stored config, not a
            # GCP failure, and calling it an API error sends the reader to the wrong
            # system. The value stays out of the note because the note is rendered in the
            # UI; it goes to the log, once, where it is diagnosable.
            logger.warning(f"GCP cost query refused: {e} (configured value {billing_table!r})")
            # Two different remediations, so two different notes. With no stored table the
            # rejected string was DERIVED from project_id, and "re-save the field" points
            # the operator at an empty input they cannot fix.
            note = (
                "Configured BigQuery billing export table is not a valid table identifier. "
                "Re-save it in Settings > Connectors."
                if stored_table
                else "No billing export table is configured, and the default derived from "
                     "the GCP project ID is not a valid table identifier. Set the billing "
                     "export table explicitly in Settings > Connectors."
            )
            return MultiCloudCostSummary(
                provider="gcp",
                total=0,
                period_start=start.isoformat(),
                period_end=today.isoformat(),
                live=False,
                source="gcp-billing",
                note=note,
            )

        except Exception as e:
            logger.warning(f"GCP cost query failed: {e}")
            return MultiCloudCostSummary(
                provider="gcp",
                total=0,
                period_start=start.isoformat(),
                period_end=today.isoformat(),
                live=False,
                source="gcp-billing",
                note=f"GCP API error: {str(e)[:100]}",
            )

    def get_agents(self) -> MultiCloudAgentInventory:
        """Get Vertex AI agent inventory."""
        if not self.is_configured():
            return MultiCloudAgentInventory(
                provider="gcp",
                live=False,
                source="vertex-ai",
                note="GCP connector not configured.",
            )

        credentials = self._get_gcp_credentials()
        if not credentials:
            return MultiCloudAgentInventory(
                provider="gcp",
                live=False,
                source="vertex-ai",
                note="GCP authentication failed.",
            )

        try:
            creds = self._load_credentials()
            project_id = creds.get("project_id")
            # Validated here as well as in configure_gcp, and BEFORE the SDK import so the
            # refusal does not depend on the SDK being importable. Same argument as
            # _url_path_credential: the write boundary cannot speak for a row it did not
            # write - a row stored before this check existed, or an operator editing
            # ava/connectors/gcp in the Secrets Manager console, both bypass it.
            #
            # Absent, or present but blank, keeps the default this line has always had:
            # neither carries an operator's choice of region, so there is nothing to refuse,
            # and taking the inventory offline over a field nobody set would be a dead end.
            # Anything else - including a non-string a console edit could leave here - is
            # validated rather than quietly replaced.
            stored_location = creds.get("location")
            if stored_location is None or (
                isinstance(stored_location, str) and not stored_location.strip()
            ):
                stored_location = "us-central1"
            location = validate_gcp_location(stored_location)

            from google.cloud import aiplatform

            aiplatform.init(project=project_id, location=location, credentials=credentials)

            agents = []

            # List deployed models (endpoints)
            endpoints = aiplatform.Endpoint.list()
            for endpoint in endpoints:
                agents.append(MultiCloudAgent(
                    agent_id=endpoint.name.split("/")[-1],
                    name=endpoint.display_name or endpoint.name.split("/")[-1],
                    provider="gcp",
                    status="active",
                    model=endpoint.deployed_models[0].model if endpoint.deployed_models else None,
                    created_at=endpoint.create_time.isoformat() if endpoint.create_time else None,
                    region=location,
                ))

            return MultiCloudAgentInventory(
                provider="gcp",
                agents=agents,
                total=len(agents),
                live=True,
                source="vertex-ai",
            )

        except InvalidConnectorIdentifierError as e:
            # A verdict on stored config, not a GCP failure, and nothing was sent: calling it
            # a "GCP API error" sends the reader to the wrong system. Same split as the
            # InvalidBillingTableError branch in get_cost_summary. `e` names the field and
            # the grammar; the value is logged here, once, with %r so an embedded CR/LF is
            # escaped rather than forging a second record.
            logger.warning(
                "GCP agent inventory refused: %s (configured value %r)",
                e,
                (self._load_credentials() or {}).get("location"),
            )
            return MultiCloudAgentInventory(
                provider="gcp",
                live=False,
                source="vertex-ai",
                note=f"Stored GCP connector configuration rejected: {e}. Re-save it in "
                     f"Settings > Connectors.",
            )

        except Exception as e:
            logger.warning(f"GCP agent inventory failed: {e}")
            return MultiCloudAgentInventory(
                provider="gcp",
                live=False,
                source="vertex-ai",
                note=f"GCP API error: {str(e)[:100]}",
            )


# ─── ServiceNow Connector ──────────────────────────────────────────────────────

class ServiceNowConnector(_SecretsBackedConnector):
    """ServiceNow Now Assist / AI Agent Studio connector.

    Auth: OAuth 2.0 with instance credentials
    Data: Agent inventory from AI Agent Studio API, license-based cost
    """

    _label = "ServiceNow"
    _secret_names = (SERVICENOW_SECRET_NAME,)

    def _get_access_token(self) -> Optional[str]:
        """Get ServiceNow OAuth access token."""
        creds = self._load_credentials()
        if not creds:
            return None

        cached = self._cached_token()
        if cached:
            return cached

        # Same asymmetry as Azure: the expiry above rate-limited success only.
        if self._auth_suppressed():
            return None

        instance_url = creds.get("instance_url")  # e.g., https://dev12345.service-now.com
        client_id = creds.get("client_id")
        client_secret = creds.get("client_secret")

        if not all([instance_url, client_id, client_secret]):
            self._mark_auth_incomplete("instance_url, client_id or client_secret missing")
            return None

        try:
            # instance_url is stored config that arrived in a request body, so it is
            # validated here too and not only at the configure route: secrets written
            # before that check exists are still what this reads.
            token_url = f"{validate_connector_base_url(instance_url)}/oauth_token.do"
            response = safe_fetch.fetch(token_url, method="POST", headers=dict(_CONNECTOR_FETCH_HEADERS), data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
            }, timeout=10)

            if response.status == 200:
                data = _json_body(response)
                token = data.get("access_token")
                if not token:
                    self._mark_auth_no_token()
                    return None
                self._token = token
                expires_in = data.get("expires_in", 1800)
                self._token_expires = datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)
                self._mark_auth_ok()
                return self._token
            self._mark_auth_status(response.status)
        except SafeFetchError as e:
            # %r on the detail: it carries the stored host, and an embedded CR/LF in a
            # caller-supplied URL would otherwise forge a second log record.
            logger.warning(f"ServiceNow token request refused or failed: {e.reason} ({e.detail!r})")
            self._mark_auth_fetch_error(e)
        except Exception as e:
            self._mark_auth_error(e)
        return None

    def is_configured(self) -> bool:
        """Whether the ServiceNow credential FIELDS are present - not whether they work.

        Presence only; see AzureConnector.is_configured. Use auth_state() for the
        measured outcome.
        """
        creds = self._load_credentials()
        return creds is not None and all([
            creds.get("instance_url"),
            creds.get("client_id"),
            creds.get("client_secret"),
        ])

    def is_connected(self) -> bool:
        """Whether ServiceNow issued a usable token, as last measured."""
        return self._get_access_token() is not None

    def test_connection(self) -> TestConnectionResult:
        """Test ServiceNow connection and return detailed result."""
        # Operator-triggered test: re-read the secret and drop any cool-off so this
        # really measures the current credentials rather than replaying an old verdict.
        self.invalidate_credentials()
        start_time = time.time()
        tested_at = datetime.now(timezone.utc).isoformat()

        if not self.is_configured():
            return TestConnectionResult(
                provider="servicenow",
                success=False,
                message="Not configured. Add ServiceNow instance credentials.",
                tested_at=tested_at,
            )

        try:
            creds = self._load_credentials()
            instance_url = validate_connector_base_url(creds.get("instance_url"))

            # Test OAuth token acquisition
            token = self._get_access_token()
            if not token:
                return TestConnectionResult(
                    provider="servicenow",
                    success=False,
                    message=f"Authentication failed ({self.auth_detail() or 'no token issued'}). "
                            f"Check Client ID and Secret.",
                    details={
                        "error": "token_acquisition_failed",
                        "auth_state": self.auth_state(),
                    },
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )

            # Test instance API access
            sys_props_url = f"{instance_url}/api/now/table/sys_properties?sysparm_limit=1"
            response = safe_fetch.fetch(
                sys_props_url,
                headers={**_CONNECTOR_FETCH_HEADERS, "Authorization": f"Bearer {token}"},
                timeout=10,
            )

            if response.status == 200:
                return TestConnectionResult(
                    provider="servicenow",
                    success=True,
                    message=f"Connected to ServiceNow instance: {instance_url}",
                    details={"instance_url": instance_url},
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )
            elif response.status == 401:
                return TestConnectionResult(
                    provider="servicenow",
                    success=False,
                    message="Token valid but API access denied. Check OAuth scopes.",
                    details={"status_code": 401, "error": "api_access_denied"},
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )
            else:
                return TestConnectionResult(
                    provider="servicenow",
                    success=False,
                    message=f"API request failed with status {response.status}.",
                    details={"status_code": response.status},
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )

        except SafeFetchError as e:
            # Reason only. e.detail names the instance host and its resolved address, and
            # this result is returned to the caller who supplied that host. %r because that
            # host is caller-supplied and could carry control characters.
            logger.warning(f"ServiceNow connection test refused or failed: {e.reason} ({e.detail!r})")
            return TestConnectionResult(
                provider="servicenow",
                success=False,
                message=f"Connection failed: {e.reason}",
                details={"error": e.reason},
                latency_ms=int((time.time() - start_time) * 1000),
                tested_at=tested_at,
            )
        except Exception as e:
            return TestConnectionResult(
                provider="servicenow",
                success=False,
                message=f"Connection failed: {str(e)[:100]}",
                details={"error": str(type(e).__name__)},
                latency_ms=int((time.time() - start_time) * 1000),
                tested_at=tested_at,
            )

    def get_cost_summary(self, days: int = 30) -> MultiCloudCostSummary:
        """Get ServiceNow cost summary (license-based)."""
        today = date.today()
        start = today - timedelta(days=days)

        if not self.is_configured():
            return MultiCloudCostSummary(
                provider="servicenow",
                total=0,
                period_start=start.isoformat(),
                period_end=today.isoformat(),
                live=False,
                source="servicenow-licensing",
                note="ServiceNow connector not configured. Add instance credentials.",
            )

        token = self._get_access_token()
        if not token:
            return MultiCloudCostSummary(
                provider="servicenow",
                total=0,
                period_start=start.isoformat(),
                period_end=today.isoformat(),
                live=False,
                source="servicenow-licensing",
                note="ServiceNow authentication failed. Check credentials.",
            )

        # ServiceNow licensing is typically per-seat, not usage-based
        # Return placeholder - real implementation would query license management
        creds = self._load_credentials()
        monthly_license_cost = float(creds.get("monthly_license_cost", 0))

        return MultiCloudCostSummary(
            provider="servicenow",
            total=monthly_license_cost,
            period_start=start.isoformat(),
            period_end=today.isoformat(),
            by_service=[
                MultiCloudCostItem(service="Now Assist Licenses", amount=monthly_license_cost),
            ],
            live=True,
            source="servicenow-licensing",
            note="License-based cost from configuration.",
        )

    def get_agents(self) -> MultiCloudAgentInventory:
        """Get ServiceNow AI agent inventory from AI Agent Studio."""
        if not self.is_configured():
            return MultiCloudAgentInventory(
                provider="servicenow",
                live=False,
                source="servicenow-ai-agent-studio",
                note="ServiceNow connector not configured.",
            )

        token = self._get_access_token()
        if not token:
            return MultiCloudAgentInventory(
                provider="servicenow",
                live=False,
                source="servicenow-ai-agent-studio",
                note="ServiceNow authentication failed.",
            )

        try:
            creds = self._load_credentials()
            instance_url = validate_connector_base_url(creds.get("instance_url"))

            # Query Now Assist agents from AI Agent Studio
            # Table: sys_cs_ai_agent (Virtual Agent AI configurations)
            url = f"{instance_url}/api/now/table/sys_cs_ai_agent"
            headers = {
                **_CONNECTOR_FETCH_HEADERS,
                "Authorization": f"Bearer {token}",
            }
            params = {"sysparm_limit": "100"}

            response = safe_fetch.fetch(url, headers=headers, params=params, timeout=15)

            if response.status != 200:
                logger.warning(f"ServiceNow agent query failed: {response.status}")
                return MultiCloudAgentInventory(
                    provider="servicenow",
                    live=False,
                    source="servicenow-ai-agent-studio",
                    note=f"API returned {response.status}",
                )

            data = _json_body(response)
            agents = []

            for item in data.get("result", []):
                agents.append(MultiCloudAgent(
                    agent_id=item.get("sys_id", ""),
                    name=item.get("name", "Unnamed Agent"),
                    provider="servicenow",
                    status="active" if item.get("active") == "true" else "inactive",
                    model=item.get("llm_model", "Now Assist LLM"),
                    created_at=item.get("sys_created_on"),
                    region="ServiceNow Cloud",
                ))

            return MultiCloudAgentInventory(
                provider="servicenow",
                agents=agents,
                total=len(agents),
                live=True,
                source="servicenow-ai-agent-studio",
            )

        except SafeFetchError as e:
            # e.detail names the host and its resolved address; the note is user-visible,
            # so only the reason category goes into it. %r on the detail, which is derived
            # from a caller-supplied URL.
            logger.warning(f"ServiceNow agent query refused or failed: {e.reason} ({e.detail!r})")
            return MultiCloudAgentInventory(
                provider="servicenow",
                live=False,
                source="servicenow-ai-agent-studio",
                note=f"API error: {e.reason}",
            )
        except Exception as e:
            logger.warning(f"ServiceNow agent inventory failed: {e}")
            return MultiCloudAgentInventory(
                provider="servicenow",
                live=False,
                source="servicenow-ai-agent-studio",
                note=f"API error: {str(e)[:100]}",
            )


# ─── Salesforce Connector ──────────────────────────────────────────────────────

class SalesforceConnector(_SecretsBackedConnector):
    """Salesforce Einstein / Agentforce connector.

    Auth: OAuth 2.0 Connected App (JWT Bearer or Client Credentials)
    Data: Agent inventory from Metadata API, usage from Event Monitoring
    """

    _label = "Salesforce"
    _secret_names = (SALESFORCE_SECRET_NAME,)

    def __init__(self, region: str = "us-east-1"):
        super().__init__(region)
        # Returned by the token exchange, not configured: only Salesforce knows which
        # instance the Connected App resolves to.
        self._instance_url: Optional[str] = None

    def invalidate_credentials(self) -> None:
        """Also drop the instance URL, which came from the old token response."""
        super().invalidate_credentials()
        self._instance_url = None

    def _get_access_token(self) -> Optional[str]:
        """Get Salesforce OAuth access token using client credentials flow."""
        creds = self._load_credentials()
        if not creds:
            return None

        cached = self._cached_token()
        if cached:
            return cached

        # Same asymmetry as Azure: the expiry above rate-limited success only.
        if self._auth_suppressed():
            return None

        login_url = creds.get("login_url", "https://login.salesforce.com")
        client_id = creds.get("client_id")
        client_secret = creds.get("client_secret")

        if not all([client_id, client_secret]):
            self._mark_auth_incomplete("client_id or client_secret missing")
            return None

        try:
            # login_url is stored config that arrived in a request body. Validated here as
            # well as at the configure route, because secrets written before that check
            # exists are still what this reads - and whoever controls login_url controls
            # where the token response below sends every later request.
            token_url = f"{validate_connector_base_url(login_url)}/services/oauth2/token"
            response = safe_fetch.fetch(token_url, method="POST", headers=dict(_CONNECTOR_FETCH_HEADERS), data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
            }, timeout=10)

            if response.status == 200:
                data = _json_body(response)
                token = data.get("access_token")
                if not token:
                    self._mark_auth_no_token()
                    return None

                # instance_url is chosen by the token response, not by configuration, and
                # every request built from it carries `Authorization: Bearer <token>`. So
                # it is validated before anything is cached: an unusable instance_url is
                # an authentication failure, not a reason to send the bearer token to an
                # unvalidated host.
                try:
                    instance_url = validate_connector_base_url(data.get("instance_url"))
                except SafeFetchError as exc:
                    # %r: instance_url came from the token response, so its host is not
                    # this platform's string and must not be pasted into a log line raw.
                    logger.warning(
                        f"Salesforce token response carried an unusable instance_url: "
                        f"{exc.reason} ({exc.detail!r})"
                    )
                    self._token = None
                    self._instance_url = None
                    # "rejected" rather than "incomplete": unlike a refused login_url, the
                    # exchange did happen and this is a verdict on its response, the same
                    # class as _mark_auth_no_token.
                    self._record_auth_failure(
                        f"instance_url refused - {exc.reason}", retryable=False, state="rejected"
                    )
                    return None

                self._token = token
                self._instance_url = instance_url
                # Salesforce tokens typically expire in 2 hours
                self._token_expires = datetime.now(timezone.utc) + timedelta(hours=2, minutes=-5)
                self._mark_auth_ok()
                return self._token
            self._mark_auth_status(response.status)
        except SafeFetchError as e:
            logger.warning(f"Salesforce token request refused or failed: {e.reason} ({e.detail!r})")
            self._mark_auth_fetch_error(e)
        except Exception as e:
            self._mark_auth_error(e)
        return None

    def is_configured(self) -> bool:
        """Whether the Salesforce credential FIELDS are present - not whether they work.

        Presence only; see AzureConnector.is_configured. Use auth_state() for the
        measured outcome.
        """
        creds = self._load_credentials()
        return creds is not None and all([
            creds.get("client_id"),
            creds.get("client_secret"),
        ])

    def is_connected(self) -> bool:
        """Whether Salesforce issued a usable token, as last measured."""
        return self._get_access_token() is not None

    def test_connection(self) -> TestConnectionResult:
        """Test Salesforce connection and return detailed result."""
        # Operator-triggered test: re-read the secret and drop any cool-off so this
        # really measures the current credentials rather than replaying an old verdict.
        self.invalidate_credentials()
        start_time = time.time()
        tested_at = datetime.now(timezone.utc).isoformat()

        if not self.is_configured():
            return TestConnectionResult(
                provider="salesforce",
                success=False,
                message="Not configured. Add Salesforce Connected App credentials.",
                tested_at=tested_at,
            )

        try:
            creds = self._load_credentials()
            login_url = creds.get("login_url", "https://login.salesforce.com")

            # Test OAuth token acquisition
            token = self._get_access_token()
            if not token:
                return TestConnectionResult(
                    provider="salesforce",
                    success=False,
                    message=f"Authentication failed ({self.auth_detail() or 'no token issued'}). "
                            f"Verify Consumer Key and Secret.",
                    details={
                        "error": "token_acquisition_failed",
                        "login_url": login_url,
                        "auth_state": self.auth_state(),
                    },
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )

            # Test org access. self._instance_url passed validate_connector_base_url in
            # _get_access_token before the token above was cached.
            org_url = f"{self._instance_url}/services/data/v59.0/sobjects/Organization/describe"
            response = safe_fetch.fetch(
                org_url,
                headers={**_CONNECTOR_FETCH_HEADERS, "Authorization": f"Bearer {token}"},
                timeout=10,
            )

            if response.status == 200:
                return TestConnectionResult(
                    provider="salesforce",
                    success=True,
                    message=f"Connected to Salesforce: {self._instance_url}",
                    details={"instance_url": self._instance_url},
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )
            elif response.status == 401:
                return TestConnectionResult(
                    provider="salesforce",
                    success=False,
                    message="Token valid but API access denied. Check Connected App permissions.",
                    details={"status_code": 401, "error": "api_access_denied"},
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )
            else:
                return TestConnectionResult(
                    provider="salesforce",
                    success=False,
                    message=f"API request failed with status {response.status}.",
                    details={"status_code": response.status},
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )

        except SafeFetchError as e:
            # Reason only; e.detail names the org host and its resolved address, %r because
            # that host came from the token response rather than from this platform.
            logger.warning(f"Salesforce connection test refused or failed: {e.reason} ({e.detail!r})")
            return TestConnectionResult(
                provider="salesforce",
                success=False,
                message=f"Connection failed: {e.reason}",
                details={"error": e.reason},
                latency_ms=int((time.time() - start_time) * 1000),
                tested_at=tested_at,
            )
        except Exception as e:
            return TestConnectionResult(
                provider="salesforce",
                success=False,
                message=f"Connection failed: {str(e)[:100]}",
                details={"error": str(type(e).__name__)},
                latency_ms=int((time.time() - start_time) * 1000),
                tested_at=tested_at,
            )

    def get_cost_summary(self, days: int = 30) -> MultiCloudCostSummary:
        """Get Salesforce cost summary (license-based)."""
        today = date.today()
        start = today - timedelta(days=days)

        if not self.is_configured():
            return MultiCloudCostSummary(
                provider="salesforce",
                total=0,
                period_start=start.isoformat(),
                period_end=today.isoformat(),
                live=False,
                source="salesforce-licensing",
                note="Salesforce connector not configured. Add Connected App credentials.",
            )

        token = self._get_access_token()
        if not token:
            return MultiCloudCostSummary(
                provider="salesforce",
                total=0,
                period_start=start.isoformat(),
                period_end=today.isoformat(),
                live=False,
                source="salesforce-licensing",
                note="Salesforce authentication failed. Check credentials.",
            )

        # Salesforce licensing is per-seat/per-feature
        creds = self._load_credentials()
        monthly_license_cost = float(creds.get("monthly_license_cost", 0))

        return MultiCloudCostSummary(
            provider="salesforce",
            total=monthly_license_cost,
            period_start=start.isoformat(),
            period_end=today.isoformat(),
            by_service=[
                MultiCloudCostItem(service="Einstein/Agentforce Licenses", amount=monthly_license_cost),
            ],
            live=True,
            source="salesforce-licensing",
            note="License-based cost from configuration.",
        )

    def get_agents(self) -> MultiCloudAgentInventory:
        """Get Salesforce Agentforce agent inventory."""
        if not self.is_configured():
            return MultiCloudAgentInventory(
                provider="salesforce",
                live=False,
                source="salesforce-agentforce",
                note="Salesforce connector not configured.",
            )

        token = self._get_access_token()
        if not token or not self._instance_url:
            return MultiCloudAgentInventory(
                provider="salesforce",
                live=False,
                source="salesforce-agentforce",
                note="Salesforce authentication failed.",
            )

        try:
            # Query Agentforce agents via Tooling API or SOQL
            # BotDefinition object stores Einstein Bot/Agentforce configs.
            # self._instance_url passed validate_connector_base_url in _get_access_token,
            # which is what makes this base safe to concatenate onto.
            url = f"{self._instance_url}/services/data/v59.0/query"
            headers = {
                **_CONNECTOR_FETCH_HEADERS,
                "Authorization": f"Bearer {token}",
            }
            params = {
                "q": "SELECT Id, DeveloperName, MasterLabel, Status FROM BotDefinition LIMIT 100"
            }

            response = safe_fetch.fetch(url, headers=headers, params=params, timeout=15)

            if response.status != 200:
                logger.warning(f"Salesforce agent query failed: {response.status}")
                return MultiCloudAgentInventory(
                    provider="salesforce",
                    live=False,
                    source="salesforce-agentforce",
                    note=f"API returned {response.status}",
                )

            data = _json_body(response)
            agents = []

            for record in data.get("records", []):
                status = record.get("Status", "").lower()
                agents.append(MultiCloudAgent(
                    agent_id=record.get("Id", ""),
                    name=record.get("MasterLabel", record.get("DeveloperName", "Unnamed Agent")),
                    provider="salesforce",
                    status="active" if status == "active" else "inactive",
                    model="Einstein GPT / Agentforce",
                    region="Salesforce Cloud",
                ))

            return MultiCloudAgentInventory(
                provider="salesforce",
                agents=agents,
                total=len(agents),
                live=True,
                source="salesforce-agentforce",
            )

        except SafeFetchError as e:
            # e.detail names the host and its resolved address; the note is user-visible,
            # so only the reason category goes into it. %r on the detail, whose host came
            # from the token response.
            logger.warning(f"Salesforce agent query refused or failed: {e.reason} ({e.detail!r})")
            return MultiCloudAgentInventory(
                provider="salesforce",
                live=False,
                source="salesforce-agentforce",
                note=f"API error: {e.reason}",
            )
        except Exception as e:
            logger.warning(f"Salesforce agent inventory failed: {e}")
            return MultiCloudAgentInventory(
                provider="salesforce",
                live=False,
                source="salesforce-agentforce",
                note=f"API error: {str(e)[:100]}",
            )


# ─── Copilot Studio Connector ──────────────────────────────────────────────────

class CopilotStudioConnector(_SecretsBackedConnector):
    """Microsoft Copilot Studio connector (Power Platform).

    Auth: Azure AD (can share credentials with Azure connector)
    Data: Agent inventory from Power Platform Admin API

    The fall back to the Azure secret is declared here rather than coded in a branch.
    It matters for two reasons: an Azure secret alone makes this connector attempt
    authentication (which is why it appears in the log next to Azure even with no
    ava/connectors/copilot-studio secret), and a rewrite of the Azure secret has to
    invalidate this connector's cache too - see configure_azure.
    """

    _label = "Copilot Studio"
    _secret_names = (COPILOT_STUDIO_SECRET_NAME, AZURE_SECRET_NAME)

    def _get_access_token(self) -> Optional[str]:
        """Get Azure AD token for Power Platform API."""
        creds = self._load_credentials()
        if not creds:
            return None

        cached = self._cached_token()
        if cached:
            return cached

        # Tracked separately from AzureConnector even when both read the same secret:
        # the scope differs, so the Power Platform exchange can be rejected while the
        # management.azure.com one succeeds. Sharing one cool-off would hide that.
        if self._auth_suppressed():
            return None

        tenant_id = creds.get("tenant_id")
        client_id = creds.get("client_id")
        client_secret = creds.get("client_secret")

        if not all([tenant_id, client_id, client_secret]):
            self._mark_auth_incomplete("tenant_id, client_id or client_secret missing")
            return None

        try:
            tenant_id = self._url_path_credential(creds, "tenant_id")
        except InvalidConnectorIdentifierError:
            # See AzureConnector._get_access_token: same field, same secret, same verdict.
            self._mark_auth_incomplete("stored tenant_id is not a single URL path segment")
            return None

        try:
            import requests

            token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
            # Power Platform API scope
            response = requests.post(token_url, data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": "https://api.powerplatform.com/.default",
            }, timeout=10)

            if response.status_code == 200:
                data = response.json()
                token = data.get("access_token")
                if not token:
                    self._mark_auth_no_token()
                    return None
                self._token = token
                expires_in = data.get("expires_in", 3600)
                self._token_expires = datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)
                self._mark_auth_ok()
                return self._token
            self._mark_auth_status(response.status_code)
        except Exception as e:
            self._mark_auth_error(e)
        return None

    def is_configured(self) -> bool:
        """Whether the Azure AD credential FIELDS are present - not whether they work.

        Presence only; see AzureConnector.is_configured. Note this is True whenever the
        Azure secret has the three fields, even with no Copilot Studio secret at all.
        Use auth_state() for the measured outcome.
        """
        creds = self._load_credentials()
        return creds is not None and all([
            creds.get("tenant_id"),
            creds.get("client_id"),
            creds.get("client_secret"),
        ])

    def is_connected(self) -> bool:
        """Whether Azure AD issued a Power Platform token, as last measured."""
        return self._get_access_token() is not None

    def test_connection(self) -> TestConnectionResult:
        """Test Copilot Studio connection and return detailed result."""
        # Operator-triggered test: re-read the secret and drop any cool-off so this
        # really measures the current credentials rather than replaying an old verdict.
        self.invalidate_credentials()
        start_time = time.time()
        tested_at = datetime.now(timezone.utc).isoformat()

        if not self.is_configured():
            return TestConnectionResult(
                provider="copilot_studio",
                success=False,
                message="Not configured. Add Azure AD credentials for Power Platform.",
                tested_at=tested_at,
            )

        try:
            import requests
            creds = self._load_credentials()
            tenant_id = creds.get("tenant_id")
            # Optional here, so validated only when present - and only because the URL below
            # interpolates it. tenant_id needs no check at this call site: it is not
            # interpolated here, and _get_access_token validates it before building the
            # token URL.
            environment_id = (
                self._url_path_credential(creds, "environment_id")
                if creds.get("environment_id")
                else None
            )

            # Test OAuth token acquisition
            token = self._get_access_token()
            if not token:
                return TestConnectionResult(
                    provider="copilot_studio",
                    success=False,
                    message=f"Authentication failed ({self.auth_detail() or 'no token issued'}). "
                            f"Check Azure AD credentials.",
                    details={
                        "error": "token_acquisition_failed",
                        "auth_state": self.auth_state(),
                    },
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )

            # Test Power Platform API access
            if environment_id:
                env_url = f"https://api.powerplatform.com/environments/{environment_id}?api-version=2022-05-01"
                response = requests.get(env_url, headers={"Authorization": f"Bearer {token}"}, timeout=10)

                if response.status_code == 200:
                    env_data = response.json()
                    return TestConnectionResult(
                        provider="copilot_studio",
                        success=True,
                        message=f"Connected to environment: {env_data.get('properties', {}).get('displayName', environment_id)}",
                        details={
                            "environment_id": environment_id,
                            "display_name": env_data.get("properties", {}).get("displayName"),
                            "type": env_data.get("properties", {}).get("environmentType"),
                        },
                        latency_ms=int((time.time() - start_time) * 1000),
                        tested_at=tested_at,
                    )
                elif response.status_code == 403:
                    return TestConnectionResult(
                        provider="copilot_studio",
                        success=False,
                        message="Permission denied. Grant Power Platform Admin role to the app.",
                        details={"status_code": 403, "error": "permission_denied"},
                        latency_ms=int((time.time() - start_time) * 1000),
                        tested_at=tested_at,
                    )
                else:
                    return TestConnectionResult(
                        provider="copilot_studio",
                        success=False,
                        message=f"Environment access failed with status {response.status_code}.",
                        details={"status_code": response.status_code},
                        latency_ms=int((time.time() - start_time) * 1000),
                        tested_at=tested_at,
                    )
            else:
                # No environment_id, just verify token works
                return TestConnectionResult(
                    provider="copilot_studio",
                    success=True,
                    message="Azure AD authentication successful. Add Environment ID for full access.",
                    details={"tenant_id": tenant_id},
                    latency_ms=int((time.time() - start_time) * 1000),
                    tested_at=tested_at,
                )

        except InvalidConnectorIdentifierError as e:
            return TestConnectionResult(
                provider="copilot_studio",
                success=False,
                message=f"Stored connector configuration rejected: {e}. Re-save it in "
                        f"Settings > Connectors.",
                details={"error": "invalid_stored_identifier"},
                latency_ms=int((time.time() - start_time) * 1000),
                tested_at=tested_at,
            )
        except Exception as e:
            return TestConnectionResult(
                provider="copilot_studio",
                success=False,
                message=f"Connection failed: {str(e)[:100]}",
                details={"error": str(type(e).__name__)},
                latency_ms=int((time.time() - start_time) * 1000),
                tested_at=tested_at,
            )

    def get_cost_summary(self, days: int = 30) -> MultiCloudCostSummary:
        """Get Copilot Studio cost summary (capacity-based)."""
        today = date.today()
        start = today - timedelta(days=days)

        if not self.is_configured():
            return MultiCloudCostSummary(
                provider="copilot_studio",
                total=0,
                period_start=start.isoformat(),
                period_end=today.isoformat(),
                live=False,
                source="copilot-studio-capacity",
                note="Copilot Studio connector not configured. Add Azure AD credentials.",
            )

        token = self._get_access_token()
        if not token:
            return MultiCloudCostSummary(
                provider="copilot_studio",
                total=0,
                period_start=start.isoformat(),
                period_end=today.isoformat(),
                live=False,
                source="copilot-studio-capacity",
                note="Copilot Studio authentication failed. Check credentials.",
            )

        # Copilot Studio uses message capacity packs
        creds = self._load_credentials()
        monthly_capacity_cost = float(creds.get("monthly_capacity_cost", 0))

        return MultiCloudCostSummary(
            provider="copilot_studio",
            total=monthly_capacity_cost,
            period_start=start.isoformat(),
            period_end=today.isoformat(),
            by_service=[
                MultiCloudCostItem(service="Copilot Studio Capacity", amount=monthly_capacity_cost),
            ],
            live=True,
            source="copilot-studio-capacity",
            note="Capacity-based cost from configuration.",
        )

    def get_agents(self) -> MultiCloudAgentInventory:
        """Get Copilot Studio agent (bot) inventory."""
        if not self.is_configured():
            return MultiCloudAgentInventory(
                provider="copilot_studio",
                live=False,
                source="copilot-studio",
                note="Copilot Studio connector not configured.",
            )

        token = self._get_access_token()
        if not token:
            return MultiCloudAgentInventory(
                provider="copilot_studio",
                live=False,
                source="copilot-studio",
                note="Copilot Studio authentication failed.",
            )

        try:
            import requests

            creds = self._load_credentials()
            environment_id = creds.get("environment_id")

            if not environment_id:
                # Try to get default environment
                logger.warning("Copilot Studio environment_id not configured")
                return MultiCloudAgentInventory(
                    provider="copilot_studio",
                    live=False,
                    source="copilot-studio",
                    note="environment_id not configured.",
                )

            environment_id = self._url_path_credential(creds, "environment_id")

            # Power Platform Chatbots API
            url = f"https://api.powerplatform.com/appmanagement/environments/{environment_id}/chatbots"
            headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
            }

            response = requests.get(url, headers=headers, timeout=15)

            if response.status_code != 200:
                logger.warning(f"Copilot Studio agent query failed: {response.status_code}")
                return MultiCloudAgentInventory(
                    provider="copilot_studio",
                    live=False,
                    source="copilot-studio",
                    note=f"API returned {response.status_code}",
                )

            data = response.json()
            agents = []

            for bot in data.get("value", []):
                agents.append(MultiCloudAgent(
                    agent_id=bot.get("id", ""),
                    name=bot.get("displayName", bot.get("name", "Unnamed Bot")),
                    provider="copilot_studio",
                    status="active" if bot.get("state") == "Published" else "draft",
                    model="GPT-4o via Azure",
                    created_at=bot.get("createdTime"),
                    region=environment_id,
                ))

            return MultiCloudAgentInventory(
                provider="copilot_studio",
                agents=agents,
                total=len(agents),
                live=True,
                source="copilot-studio",
            )

        except InvalidConnectorIdentifierError as e:
            return MultiCloudAgentInventory(
                provider="copilot_studio",
                live=False,
                source="copilot-studio",
                note=f"Stored Copilot Studio configuration rejected: {e}. Re-save it in "
                     f"Settings > Connectors.",
            )

        except Exception as e:
            logger.warning(f"Copilot Studio agent inventory failed: {e}")
            return MultiCloudAgentInventory(
                provider="copilot_studio",
                live=False,
                source="copilot-studio",
                note=f"API error: {str(e)[:100]}",
            )


# ─── Multi-Cloud Connector Service ─────────────────────────────────────────────

class MultiCloudConnectorService:
    """Service for managing multi-cloud and SaaS cost/agent connectors."""

    def __init__(self, region: str = "us-east-1"):
        self.region = region
        # Cloud Service Providers
        self._azure = AzureConnector(region)
        self._gcp = GCPConnector(region)
        # SaaS Platforms
        self._servicenow = ServiceNowConnector(region)
        self._salesforce = SalesforceConnector(region)
        self._copilot_studio = CopilotStudioConnector(region)

    def _connector_status(
        self,
        connector: _SecretsBackedConnector,
        *,
        provider: str,
        label: str,
        source: str,
        connected_detail: str,
        config_hint: str,
        unmeasured_detail: str = "Credentials present, but no successful authentication has been measured yet.",
    ) -> ConnectorStatus:
        """Build one ConnectorStatus, calling each probe exactly once.

        is_connected() drives a real token exchange for the OAuth connectors. The
        previous version of get_connector_status called it twice per connector - once for
        the `connected` field and again inside the ternary that produced `detail` - so
        every poll of GET /multicloud/status sent two token requests per connector, not
        one. That is why a dashboard polling three times in fifteen minutes produced six
        warnings rather than three.

        The `detail` text below is also why this helper exists: the old string said
        "Configured — authentication pending." for a connector whose credentials had
        already been measured as rejected. "Pending" claims no verdict has been reached
        yet, which was untrue and unmeasured. Each branch here now reports only what was
        actually observed.
        """
        configured = connector.is_configured()
        connected = connector.is_connected()
        state = connector.auth_state()
        reason = connector.auth_detail()
        suffix = f" ({reason})" if reason else ""

        if connected:
            detail = connected_detail
        elif not configured:
            detail = f"Not configured. {config_hint}"
        elif state == "rejected":
            detail = (f"Credentials present but rejected by the provider{suffix}. "
                      f"Update them in Settings > Connectors.")
        elif state == "unavailable":
            detail = (f"Credentials present; the provider could not be reached{suffix}. "
                      f"Retrying automatically.")
        elif state == "incomplete":
            detail = f"Credentials incomplete{suffix}. Re-save them in Settings > Connectors."
        else:
            detail = unmeasured_detail

        return ConnectorStatus(
            provider=provider,
            label=label,
            connected=connected,
            configured=configured,
            source=source,
            detail=detail,
            auth_state=state,
            auth_detail=reason,
        )

    def get_connector_status(self) -> MultiCloudConnectorsResponse:
        """Get status of all multi-cloud and SaaS connectors."""
        connectors = [
            # Cloud Service Providers
            self._connector_status(
                self._azure,
                provider="azure",
                label="Azure (Cost Management + AI Foundry)",
                source="azure-cost-management",
                connected_detail="Connected — live cost and agent data from Azure.",
                config_hint="Add Azure service principal credentials.",
            ),
            self._connector_status(
                self._gcp,
                provider="gcp",
                label="GCP (Billing + Vertex AI)",
                source="gcp-billing-bigquery",
                connected_detail="Connected — live cost and agent data from GCP.",
                config_hint="Add GCP service account credentials.",
                # GCP has no token exchange to record, so auth_state stays "unknown".
                # is_connected() above just measured the key locally, and it said no.
                unmeasured_detail=("Credentials present, but the GCP service account key could "
                                   "not be loaded. Re-paste the JSON key."),
            ),
            # SaaS Platforms
            self._connector_status(
                self._servicenow,
                provider="servicenow",
                label="ServiceNow (Now Assist + AI Agent Studio)",
                source="servicenow-ai-agent-studio",
                connected_detail="Connected — live agent inventory from ServiceNow.",
                config_hint="Add ServiceNow instance credentials.",
            ),
            self._connector_status(
                self._salesforce,
                provider="salesforce",
                label="Salesforce (Einstein + Agentforce)",
                source="salesforce-agentforce",
                connected_detail="Connected — live agent inventory from Salesforce.",
                config_hint="Add Salesforce Connected App credentials.",
            ),
            self._connector_status(
                self._copilot_studio,
                provider="copilot_studio",
                label="Copilot Studio (Power Platform)",
                source="copilot-studio",
                connected_detail="Connected — live agent inventory from Copilot Studio.",
                config_hint="Add Azure AD credentials.",
            ),
        ]

        return MultiCloudConnectorsResponse(
            connectors=connectors,
            live=any(c.connected for c in connectors),
            source="multicloud-connectors",
        )

    def get_all_costs(self, days: int = 30) -> Dict[str, MultiCloudCostSummary]:
        """Get cost summaries from all configured providers."""
        return {
            # Cloud Service Providers
            "azure": self._azure.get_cost_summary(days),
            "gcp": self._gcp.get_cost_summary(days),
            # SaaS Platforms
            "servicenow": self._servicenow.get_cost_summary(days),
            "salesforce": self._salesforce.get_cost_summary(days),
            "copilot_studio": self._copilot_studio.get_cost_summary(days),
        }

    def get_all_agents(self) -> Dict[str, MultiCloudAgentInventory]:
        """Get agent inventories from all configured providers."""
        return {
            # Cloud Service Providers
            "azure": self._azure.get_agents(),
            "gcp": self._gcp.get_agents(),
            # SaaS Platforms
            "servicenow": self._servicenow.get_agents(),
            "salesforce": self._salesforce.get_agents(),
            "copilot_studio": self._copilot_studio.get_agents(),
        }

    def test_connection(self, provider: str) -> TestConnectionResult:
        """Test connection for a specific provider."""
        connectors = {
            "azure": self._azure,
            "gcp": self._gcp,
            "servicenow": self._servicenow,
            "salesforce": self._salesforce,
            "copilot_studio": self._copilot_studio,
        }
        connector = connectors.get(provider)
        if not connector:
            return TestConnectionResult(
                provider=provider,
                success=False,
                message=f"Unknown provider: {provider}",
                tested_at=datetime.now(timezone.utc).isoformat(),
            )
        return connector.test_connection()

    def configure_azure(
        self,
        tenant_id: str,
        client_id: str,
        client_secret: str,
        subscription_id: str,
    ) -> ConnectorWriteResult:
        """Configure Azure connector credentials.

        Raises InvalidConnectorIdentifierError for a tenant_id or subscription_id that is
        not a single URL path segment. Both are interpolated into a management.azure.com or
        login.microsoftonline.com URL alongside a fixed `?api-version=`, so a value carrying
        `/` or `?` chooses the endpoint rather than the resource - see
        validate_url_path_segment.

        `url_verified` is None in the result: every host this connector reaches is a fixed
        literal in this module, so there is no URL whose reachability this write could have
        measured, and claiming one either way would be an invention.
        """
        saved = _save_secret(AZURE_SECRET_NAME, {
            "tenant_id": validate_url_path_segment(tenant_id, "tenant_id"),
            "client_id": client_id,
            "client_secret": client_secret,
            "subscription_id": validate_url_path_segment(subscription_id, "subscription_id"),
        }, self.region)
        if saved:
            # Without this the connectors keep serving the credentials they read at
            # start-up: the cache had no expiry, so saving a fix here changed nothing
            # until the process restarted, and the cool-off added by this change would
            # have made that worse by also suppressing the re-probe. Copilot Studio is
            # invalidated too because it falls back to this same secret.
            self._azure.invalidate_credentials()
            self._copilot_studio.invalidate_credentials()
        return ConnectorWriteResult(saved=saved)

    def configure_gcp(
        self,
        project_id: str,
        service_account_json: str,
        billing_export_table: Optional[str] = None,
        location: str = "us-central1",
    ) -> ConnectorWriteResult:
        """Configure GCP connector credentials.

        Raises InvalidBillingTableError for a table name that is not a plain BigQuery
        identifier, so bad config is never stored. The name is interpolated into the
        billing query's FROM clause (a table cannot be a query parameter), and a
        rejection has to be visible rather than silently replaced by the default table.

        Raises InvalidConnectorIdentifierError for a project_id that would not stay inside
        one URL path segment. It is interpolated into the Resource Manager URL that
        test_connection requests, and - with no billing_export_table stored - into the
        default table name the billing query derives, so it was a caller-supplied URL component
        this module stored unchecked. See validate_gcp_project_id for why its grammar is
        validate_url_path_segment's plus one legacy colon.

        It was not the only such component. `location` is validated too, and raises the same
        exception type: get_agents hands it to `aiplatform.init`, where the SDK derives the
        Vertex AI API endpoint host from it, and it used to be stored exactly as supplied
        because the route's Field carried a default but no pattern. What that host
        construction would do with a hostile value is still unverified - google-cloud-
        aiplatform is not installed in this environment, so no exploit was demonstrated and
        none is claimed. The check is defence in depth on a caller-controlled value reaching
        a client-library initialiser: see validate_gcp_location for the grammar and for why
        it is a pattern rather than a list of today's regions.

        `url_verified` is None: as with Azure, this connector's hosts are fixed literals.
        """
        config = {
            "project_id": validate_gcp_project_id(project_id),
            "service_account_json": service_account_json,
            "location": validate_gcp_location(location),
        }
        if billing_export_table:
            config["billing_export_table"] = validate_billing_export_table(billing_export_table)
        saved = _save_secret(GCP_SECRET_NAME, config, self.region)
        if saved:
            self._gcp.invalidate_credentials()
        return ConnectorWriteResult(saved=saved)

    def configure_servicenow(
        self,
        instance_url: str,
        client_id: str,
        client_secret: str,
        monthly_license_cost: float = 0,
    ) -> ConnectorWriteResult:
        """Configure ServiceNow connector credentials.

        Raises SafeFetchError for an instance_url this platform would refuse to fetch, so
        an unreachable-by-policy target is never stored. Callers must map `reason` to a
        400 and keep `detail` out of the response - see validate_connector_base_url.

        `require_resolvable=False`: a URL that does not resolve at this instant is not a
        verdict on the URL, and refusing the write would leave an admin unable to store
        correct credentials while DNS is down. Every use re-validates and pins.

        That leniency is why the result carries `url_verified`. Storing a URL whose address
        was never checked and answering "configured successfully" would present an
        unmeasured value as a measured one, which is the one thing this platform's
        live/source/note convention exists to stop.
        """
        instance_url, resolved = _validate_connector_base_url(
            instance_url, require_resolvable=False
        )
        saved = _save_secret(SERVICENOW_SECRET_NAME, {
            "instance_url": instance_url,
            "client_id": client_id,
            "client_secret": client_secret,
            "monthly_license_cost": monthly_license_cost,
        }, self.region)
        if saved:
            self._servicenow.invalidate_credentials()
        return ConnectorWriteResult(saved=saved, url_verified=resolved)

    def configure_salesforce(
        self,
        client_id: str,
        client_secret: str,
        login_url: str = "https://login.salesforce.com",
        monthly_license_cost: float = 0,
    ) -> ConnectorWriteResult:
        """Configure Salesforce connector credentials.

        Raises SafeFetchError for a login_url this platform would refuse to fetch. This one
        matters twice over: the token response from login_url also names the instance_url
        that every later request - each carrying the bearer token - is built from.

        Resolution is not required here either; see configure_servicenow, including why the
        result says whether it happened. The address verdicts still apply, and the
        instance_url from the token response is validated in full at use time, resolution
        included.
        """
        login_url, resolved = _validate_connector_base_url(login_url, require_resolvable=False)
        saved = _save_secret(SALESFORCE_SECRET_NAME, {
            "client_id": client_id,
            "client_secret": client_secret,
            "login_url": login_url,
            "monthly_license_cost": monthly_license_cost,
        }, self.region)
        if saved:
            self._salesforce.invalidate_credentials()
        return ConnectorWriteResult(saved=saved, url_verified=resolved)

    def configure_copilot_studio(
        self,
        tenant_id: str,
        client_id: str,
        client_secret: str,
        environment_id: str,
        monthly_capacity_cost: float = 0,
    ) -> ConnectorWriteResult:
        """Configure Copilot Studio connector credentials.

        Raises InvalidConnectorIdentifierError for a tenant_id or environment_id that is not
        a single URL path segment: both are interpolated into an api.powerplatform.com or
        login.microsoftonline.com URL that carries a fixed `?api-version=` suffix, which a
        `?` in the stored value silently absorbs.

        `url_verified` is None: as with Azure, this connector's hosts are fixed literals.
        """
        saved = _save_secret(COPILOT_STUDIO_SECRET_NAME, {
            "tenant_id": validate_url_path_segment(tenant_id, "tenant_id"),
            "client_id": client_id,
            "client_secret": client_secret,
            "environment_id": validate_url_path_segment(environment_id, "environment_id"),
            "monthly_capacity_cost": monthly_capacity_cost,
        }, self.region)
        if saved:
            self._copilot_studio.invalidate_credentials()
        return ConnectorWriteResult(saved=saved)


# Singleton instance
_service: Optional[MultiCloudConnectorService] = None


def get_multicloud_service(region: str = "us-east-1") -> MultiCloudConnectorService:
    """Get the multi-cloud connector service singleton."""
    global _service
    if _service is None:
        _service = MultiCloudConnectorService(region)
    return _service
