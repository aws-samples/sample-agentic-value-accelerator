"""Multi-Cloud Connector API — Azure and GCP cost/agent endpoints.

Provides:
- Connector status (configured/connected)
- Cost summaries from Azure/GCP
- Agent inventories from Azure/GCP
- Connector configuration endpoints
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

from core.auth import get_current_user, require_admin
from core.safe_fetch import SafeFetchError, is_allowlistable_refusal
from services.multicloud_connector_service import (
    get_multicloud_service,
    ConnectorWriteResult,
    InvalidBillingTableError,
    InvalidConnectorIdentifierError,
    MultiCloudConnectorsResponse,
    MultiCloudCostSummary,
    MultiCloudAgentInventory,
    TestConnectionResult,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/govern/multicloud", tags=["multicloud"])


def _reject_url(field: str, exc: SafeFetchError) -> HTTPException:
    """Turn a refused connector URL into a 400 that names the field and the reason.

    The reason category ("blocked_link_local_address", "blocked_scheme") is what an admin
    who mistyped a URL needs. exc.detail carries the host and the address it resolved to
    and is logged instead: returning it would answer the port-scan question the refusal
    exists to refuse. Both attributes are safe to log as they arrive - SafeFetchError
    escapes control characters in each of them at construction (read in core/safe_fetch.py:
    `SafeFetchError.__init__` calls `_scrub_control_chars` on `reason` and `detail`), so a
    CR/LF in the host cannot forge a second record from here. %r is kept on the detail
    because quoting makes an escaped value unambiguous in the log, not as the guard.

    For a private-network refusal the message also names SAFE_FETCH_ALLOWED_PRIVATE_CIDRS.
    An operator whose connector genuinely is internal otherwise has a dead end here: the
    guard is right to refuse by default, and the way to permit it is not discoverable from
    "blocked_private_address" alone. The hint names the setting, never the address.

    Which refusals the allowlist could actually override is safe_fetch's fact, not this
    module's: `is_allowlistable_refusal` is asked rather than a local copy of the set kept
    here. A copy would not fail if safe_fetch gained a refusal - the hint would just quietly
    go missing, or start being offered for something no CIDR can permit.
    """
    logger.warning("Rejected %s at configure time: %s (%r)", field, exc.reason, exc.detail)
    message = f"{field} rejected: {exc.reason}"
    if is_allowlistable_refusal(exc.reason):
        message += (
            ". If this connector really is on an internal network, add that network to "
            "SAFE_FETCH_ALLOWED_PRIVATE_CIDRS."
        )
    return HTTPException(status_code=400, detail=message)


def _reject_identifier(exc: InvalidConnectorIdentifierError) -> HTTPException:
    """Turn a rejected connector config token into a 400 naming the grammar.

    The set is a tenant/subscription/environment id, a GCP project_id, and the GCP
    `location`. The first four are interpolated into a URL path segment; `location` is not
    written into a URL here at all - it reaches `aiplatform.init` and the SDK builds an
    endpoint host from it - which is why the wording is "config token" rather than "id". One
    handler for all of them because the response is identical: the field, the grammar, and
    nothing else.

    The exception's message states the required grammar and never quotes the rejected
    value, so it is safe to return; the value itself stays out of both the response and the
    log, where it would be a caller-controlled string in a log line for no diagnostic gain
    (the grammar says everything the operator needs).
    """
    logger.warning(f"Rejected a connector identifier at configure time: {exc}")
    return HTTPException(status_code=400, detail=str(exc))


def _connector_secrets_region() -> str:
    """Region the connector-credential secrets live in.

    Deferred to the service singleton instead of restated as a literal in each delete
    route. It has to be the same region the writes use: configure_* stores these secrets
    through MultiCloudConnectorService._save_secret(..., self.region) and status reads them
    through _get_secret(..., self.region), so a delete that derived its own region would
    delete from somewhere other than where configure wrote. Measured read-only in
    Demo account: ava/connectors/azure exists in us-east-1 and does not exist in us-east-2,
    so resolving this through the control-plane region (AWS_REGION=us-east-2 here) would
    have broken every delete.

    Unlike the tier-2 sites, a wrong region here is honest rather than silent: Secrets
    Manager is regional and is not in region_config.SERVICE_PINNED_REGIONS, so a miss raises
    ResourceNotFoundException instead of returning a smaller inventory under a live flag.

    The remaining literal is MultiCloudConnectorService's own `region="us-east-1"` default,
    which is now the single place that decides this.
    """
    return get_multicloud_service().region


# ─── Response Models ───────────────────────────────────────────────────────────

class ConfigureAzureRequest(BaseModel):
    """Request to configure Azure connector."""
    tenant_id: str = Field(
        ...,
        description="Azure AD tenant ID (GUID or domain). Interpolated into a login URL, so "
                    "letters, digits, dot, underscore and hyphen only."
    )
    client_id: str = Field(..., description="Azure AD application (client) ID")
    client_secret: str = Field(..., description="Azure AD client secret")
    subscription_id: str = Field(
        ...,
        description="Azure subscription ID (GUID). Interpolated into a management.azure.com "
                    "URL, so letters, digits, dot, underscore and hyphen only."
    )


class ConfigureGCPRequest(BaseModel):
    """Request to configure GCP connector."""
    project_id: str = Field(..., description="GCP project ID")
    service_account_json: str = Field(..., description="GCP service account JSON key (full JSON)")
    billing_export_table: Optional[str] = Field(
        None,
        description="BigQuery billing export table (e.g., project.dataset.table). Letters, "
                    "digits, underscore and hyphen only, with dots as separators; a legacy "
                    "domain-scoped project keeps its 'domain:' prefix. If not provided, "
                    "defaults to standard export location."
    )
    location: str = Field(
        "us-central1",
        description="Default Vertex AI location: a GCP region such as us-central1 or "
                    "europe-west4, or a multi-region such as eu. Lowercase letters and "
                    "digits in at most three hyphen-separated parts - it is handed to "
                    "aiplatform.init, which derives the Vertex AI API endpoint host from it."
    )


class ConfigureResponse(BaseModel):
    """Response from connector configuration.

    `success` is about the write and nothing else. `url_verified` is the honest-degrade half:
    a connector URL is stored even when its hostname did not resolve during the POST (a
    resolver outage is not a verdict on the URL - see validate_connector_base_url), and this
    is what stops that write being reported in the same words as a verified one.
    """
    success: bool
    message: str
    url_verified: Optional[bool] = Field(
        None,
        description="True: the connector URL resolved and every address it resolved to "
                    "passed the address checks (no connection was attempted, so this is not "
                    "a claim that the connector answered). False: stored, but that question "
                    "could not be answered right now - the URL is checked again, and refused "
                    "if it fails, on every use. None: this endpoint has no URL to check.",
    )


class ConfigureServiceNowRequest(BaseModel):
    """Request to configure ServiceNow connector."""
    instance_url: str = Field(
        ...,
        description="ServiceNow instance URL (e.g., https://dev12345.service-now.com). "
                    "Must be http(s) and carry no query string: it is used as a base that "
                    "fixed API paths are appended to. It must not resolve to a private, "
                    "loopback or link-local address unless that network is listed in "
                    "SAFE_FETCH_ALLOWED_PRIVATE_CIDRS."
    )
    client_id: str = Field(..., description="OAuth Client ID")
    client_secret: str = Field(..., description="OAuth Client Secret")
    monthly_license_cost: float = Field(0, description="Monthly license cost for cost tracking")


class ConfigureSalesforceRequest(BaseModel):
    """Request to configure Salesforce connector."""
    client_id: str = Field(..., description="Connected App Client ID (Consumer Key)")
    client_secret: str = Field(..., description="Connected App Client Secret (Consumer Secret)")
    login_url: str = Field(
        "https://login.salesforce.com",
        description="Login URL (login.salesforce.com or test.salesforce.com). Same rules as "
                    "ServiceNow's instance_url: http(s), no query string, and no private or "
                    "link-local address behind the name."
    )
    monthly_license_cost: float = Field(0, description="Monthly license cost for cost tracking")


class ConfigureCopilotStudioRequest(BaseModel):
    """Request to configure Copilot Studio connector."""
    tenant_id: str = Field(
        ...,
        description="Azure AD tenant ID (GUID or domain). Letters, digits, dot, underscore "
                    "and hyphen only."
    )
    client_id: str = Field(..., description="Azure AD application (client) ID")
    client_secret: str = Field(..., description="Azure AD client secret")
    environment_id: str = Field(
        ...,
        description="Power Platform environment ID. Interpolated into an api.powerplatform.com "
                    "URL, so letters, digits, dot, underscore and hyphen only."
    )
    monthly_capacity_cost: float = Field(0, description="Monthly capacity cost for cost tracking")


class AllCostsResponse(BaseModel):
    """Response with costs from all providers."""
    # Cloud Service Providers
    azure: MultiCloudCostSummary
    gcp: MultiCloudCostSummary
    # SaaS Platforms
    servicenow: MultiCloudCostSummary
    salesforce: MultiCloudCostSummary
    copilot_studio: MultiCloudCostSummary


class AllAgentsResponse(BaseModel):
    """Response with agents from all providers."""
    # Cloud Service Providers
    azure: MultiCloudAgentInventory
    gcp: MultiCloudAgentInventory
    # SaaS Platforms
    servicenow: MultiCloudAgentInventory
    salesforce: MultiCloudAgentInventory
    copilot_studio: MultiCloudAgentInventory


def _configured_response(
    label: str, result: ConnectorWriteResult, url_field: str = "connector URL"
) -> ConfigureResponse:
    """The 200 for a successful write, saying which of two things actually happened.

    "stored and the URL checks out" and "stored, and we could not check the URL right now"
    are different outcomes, and the second one used to be reported with the first one's
    words: `ConfigureResponse(success=True, message="... configured successfully.")`, with
    the unverified write recorded only in a server-side log the operator never sees. That is
    the same defect as a derived number under a live badge, which is why the wording changes
    with the measurement instead of restating success.

    Both halves are returned on purpose: `url_verified` for a UI to badge, and a message that
    says the same thing in words for any client that only shows the text.

    The UI half took two fixes to become honest, and both are now in, so changing the wording
    here does reach an operator. `MultiCloudGovernance.tsx` (`handleSaveConfig`) used to
    hardcode its own "<provider> connector configured successfully" toast whenever
    `result.success` was true and read `result.message` only in the `else` branch - which a
    200 never reaches, because a write that did not save is raised as a 500 above, so
    `success` is always true here and cannot carry this distinction. Separately,
    `url_verified` was absent from the `ConfigureResponse` interface in
    `frontend/src/api/client.ts`, so it was typed away before a component could read it.
    Either gap alone was enough to keep the wording below off the screen. The component now
    renders `message`, and on `url_verified === false` shows it as an amber warning that does
    not auto-dismiss - a 3.5s toast being the wrong weight for "we stored something we could
    not reach".

    `url_field` is only ever read on the unverified branch, which only the two providers
    that have a caller-supplied URL can reach; the other three take the default and say
    "configured successfully" as before, with `url_verified=None` meaning "nothing to check
    here" rather than "checked and fine".
    """
    if result.url_verified is False:
        return ConfigureResponse(
            success=True,
            url_verified=False,
            message=(
                f"{label} connector credentials stored, but the {url_field} could not be "
                f"verified: its hostname did not resolve just now, so whether it is a URL "
                f"this platform will fetch is still unknown. It is checked again - and "
                f"refused if it fails - the first time the connector is used."
            ),
        )
    return ConfigureResponse(
        success=True,
        url_verified=result.url_verified,
        message=f"{label} connector configured successfully.",
    )


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status", response_model=MultiCloudConnectorsResponse)
async def get_connector_status(_=Depends(get_current_user)):
    """Get status of all cloud and SaaS connectors."""
    return get_multicloud_service().get_connector_status()


@router.post("/test-connection/{provider}", response_model=TestConnectionResult)
async def test_connection(
    provider: str,
    _=Depends(get_current_user),
):
    """Test connection for a specific provider.

    Validates credentials by attempting to authenticate and access the provider's API.
    Returns detailed connection result including latency and error messages.
    """
    valid_providers = ["azure", "gcp", "servicenow", "salesforce", "copilot_studio"]
    if provider not in valid_providers:
        raise HTTPException(status_code=400, detail=f"Invalid provider. Must be one of: {', '.join(valid_providers)}")
    return get_multicloud_service().test_connection(provider)


@router.get("/costs", response_model=AllCostsResponse)
async def get_all_costs(
    days: int = Query(default=30, ge=1, le=90, description="Number of days to query"),
    _=Depends(get_current_user),
):
    """Get cost summaries from all configured cloud and SaaS providers."""
    costs = get_multicloud_service().get_all_costs(days)
    return AllCostsResponse(**costs)


@router.get("/costs/azure", response_model=MultiCloudCostSummary)
async def get_azure_costs(
    days: int = Query(default=30, ge=1, le=90),
    _=Depends(get_current_user),
):
    """Get Azure cost summary from Cost Management API."""
    return get_multicloud_service()._azure.get_cost_summary(days)


@router.get("/costs/gcp", response_model=MultiCloudCostSummary)
async def get_gcp_costs(
    days: int = Query(default=30, ge=1, le=90),
    _=Depends(get_current_user),
):
    """Get GCP cost summary from BigQuery billing export."""
    return get_multicloud_service()._gcp.get_cost_summary(days)


@router.get("/costs/servicenow", response_model=MultiCloudCostSummary)
async def get_servicenow_costs(
    days: int = Query(default=30, ge=1, le=90),
    _=Depends(get_current_user),
):
    """Get ServiceNow cost summary (license-based)."""
    return get_multicloud_service()._servicenow.get_cost_summary(days)


@router.get("/costs/salesforce", response_model=MultiCloudCostSummary)
async def get_salesforce_costs(
    days: int = Query(default=30, ge=1, le=90),
    _=Depends(get_current_user),
):
    """Get Salesforce cost summary (license-based)."""
    return get_multicloud_service()._salesforce.get_cost_summary(days)


@router.get("/costs/copilot-studio", response_model=MultiCloudCostSummary)
async def get_copilot_studio_costs(
    days: int = Query(default=30, ge=1, le=90),
    _=Depends(get_current_user),
):
    """Get Copilot Studio cost summary (capacity-based)."""
    return get_multicloud_service()._copilot_studio.get_cost_summary(days)


@router.get("/agents", response_model=AllAgentsResponse)
async def get_all_agents(_=Depends(get_current_user)):
    """Get agent inventories from all configured cloud and SaaS providers."""
    agents = get_multicloud_service().get_all_agents()
    return AllAgentsResponse(**agents)


@router.get("/agents/azure", response_model=MultiCloudAgentInventory)
async def get_azure_agents(_=Depends(get_current_user)):
    """Get Azure AI Foundry agent inventory."""
    return get_multicloud_service()._azure.get_agents()


@router.get("/agents/gcp", response_model=MultiCloudAgentInventory)
async def get_gcp_agents(_=Depends(get_current_user)):
    """Get GCP Vertex AI agent inventory."""
    return get_multicloud_service()._gcp.get_agents()


@router.get("/agents/servicenow", response_model=MultiCloudAgentInventory)
async def get_servicenow_agents(_=Depends(get_current_user)):
    """Get ServiceNow AI agent inventory."""
    return get_multicloud_service()._servicenow.get_agents()


@router.get("/agents/salesforce", response_model=MultiCloudAgentInventory)
async def get_salesforce_agents(_=Depends(get_current_user)):
    """Get Salesforce Agentforce agent inventory."""
    return get_multicloud_service()._salesforce.get_agents()


@router.get("/agents/copilot-studio", response_model=MultiCloudAgentInventory)
async def get_copilot_studio_agents(_=Depends(get_current_user)):
    """Get Copilot Studio agent inventory."""
    return get_multicloud_service()._copilot_studio.get_agents()


@router.post("/configure/azure", response_model=ConfigureResponse)
async def configure_azure(
    request: ConfigureAzureRequest,
    _=Depends(require_admin),
):
    """Configure Azure connector credentials (stored in AWS Secrets Manager)."""
    try:
        # Off the event loop: _save_secret is a blocking botocore call (create_secret, then
        # update_secret if it already exists), so on the loop thread it stalls every other
        # request on this worker for the round trip. configure_servicenow and
        # configure_salesforce were moved in the first pass; these three were not, which
        # left the same blocking write on the loop for three of the five providers.
        result = await asyncio.to_thread(
            get_multicloud_service().configure_azure,
            tenant_id=request.tenant_id,
            client_id=request.client_id,
            client_secret=request.client_secret,
            subscription_id=request.subscription_id,
        )
    except InvalidConnectorIdentifierError as exc:
        raise _reject_identifier(exc) from exc
    if not result.saved:
        raise HTTPException(status_code=500, detail="Failed to save Azure credentials to Secrets Manager.")
    return _configured_response("Azure", result)


@router.post("/configure/gcp", response_model=ConfigureResponse)
async def configure_gcp(
    request: ConfigureGCPRequest,
    _=Depends(require_admin),
):
    """Configure GCP connector credentials (stored in AWS Secrets Manager)."""
    try:
        # Threaded for the same reason as configure_azure: the Secrets Manager write blocks.
        result = await asyncio.to_thread(
            get_multicloud_service().configure_gcp,
            project_id=request.project_id,
            service_account_json=request.service_account_json,
            billing_export_table=request.billing_export_table,
            location=request.location,
        )
    except InvalidBillingTableError as exc:
        # The table name is interpolated into the billing query, so it is validated before
        # it is stored. The message names the required grammar and never echoes the
        # rejected value, which is caller-controlled text.
        logger.warning(f"Rejected billing_export_table at configure time: {exc}")
        raise HTTPException(status_code=400, detail=f"billing_export_table rejected: {exc}") from exc
    except InvalidConnectorIdentifierError as exc:
        # project_id is interpolated into the Resource Manager URL, and into the default
        # billing table when none is stored, so it is validated on the same terms as the
        # Azure and Copilot Studio identifiers.
        #
        # `location` raises the same type. It is not a URL component this module builds: it
        # is handed to aiplatform.init, which derives the Vertex AI endpoint host from it
        # inside the SDK. google-cloud-aiplatform is not installed here, so what that
        # construction does with a hostile value is unverified and no exploit is claimed -
        # this is defence in depth on an unbounded caller-controlled value reaching a client
        # library's initialiser. See validate_gcp_location.
        raise _reject_identifier(exc) from exc
    if not result.saved:
        raise HTTPException(status_code=500, detail="Failed to save GCP credentials to Secrets Manager.")
    return _configured_response("GCP", result)


@router.delete("/configure/azure", response_model=ConfigureResponse)
async def delete_azure_config(_=Depends(require_admin)):
    """Delete Azure connector configuration."""
    try:
        import boto3
        client = boto3.client("secretsmanager", region_name=_connector_secrets_region())
        client.delete_secret(SecretId="ava/connectors/azure", ForceDeleteWithoutRecovery=True)
        return ConfigureResponse(success=True, message="Azure connector configuration deleted.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete Azure config: {str(e)}")


@router.delete("/configure/gcp", response_model=ConfigureResponse)
async def delete_gcp_config(_=Depends(require_admin)):
    """Delete GCP connector configuration."""
    try:
        import boto3
        client = boto3.client("secretsmanager", region_name=_connector_secrets_region())
        client.delete_secret(SecretId="ava/connectors/gcp", ForceDeleteWithoutRecovery=True)
        return ConfigureResponse(success=True, message="GCP connector configuration deleted.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete GCP config: {str(e)}")


# ─── SaaS Configuration Endpoints ──────────────────────────────────────────────

@router.post("/configure/servicenow", response_model=ConfigureResponse)
async def configure_servicenow(
    request: ConfigureServiceNowRequest,
    _=Depends(require_admin),
):
    """Configure ServiceNow connector credentials (stored in AWS Secrets Manager)."""
    try:
        # Off the event loop. Validating instance_url resolves it, and socket.getaddrinfo
        # takes no timeout argument, so a hostname whose nameserver black-holes UDP would
        # stall every other request on this worker for the resolver's own 10-40s. The
        # Secrets Manager write in the same call is blocking too.
        result = await asyncio.to_thread(
            get_multicloud_service().configure_servicenow,
            instance_url=request.instance_url,
            client_id=request.client_id,
            client_secret=request.client_secret,
            monthly_license_cost=request.monthly_license_cost,
        )
    except SafeFetchError as exc:
        raise _reject_url("instance_url", exc) from exc
    if not result.saved:
        raise HTTPException(status_code=500, detail="Failed to save ServiceNow credentials to Secrets Manager.")
    # Not always "configured successfully": with the resolver down the URL is stored with its
    # address verdict unknown, and the response has to say so. See _configured_response.
    return _configured_response("ServiceNow", result, "instance_url")


@router.post("/configure/salesforce", response_model=ConfigureResponse)
async def configure_salesforce(
    request: ConfigureSalesforceRequest,
    _=Depends(require_admin),
):
    """Configure Salesforce connector credentials (stored in AWS Secrets Manager)."""
    try:
        # Threaded for the same reason as configure_servicenow: the login_url check
        # resolves, and getaddrinfo cannot be given a deadline.
        result = await asyncio.to_thread(
            get_multicloud_service().configure_salesforce,
            client_id=request.client_id,
            client_secret=request.client_secret,
            login_url=request.login_url,
            monthly_license_cost=request.monthly_license_cost,
        )
    except SafeFetchError as exc:
        raise _reject_url("login_url", exc) from exc
    if not result.saved:
        raise HTTPException(status_code=500, detail="Failed to save Salesforce credentials to Secrets Manager.")
    return _configured_response("Salesforce", result, "login_url")


@router.post("/configure/copilot-studio", response_model=ConfigureResponse)
async def configure_copilot_studio(
    request: ConfigureCopilotStudioRequest,
    _=Depends(require_admin),
):
    """Configure Copilot Studio connector credentials (stored in AWS Secrets Manager)."""
    try:
        # Threaded for the same reason as configure_azure: the Secrets Manager write blocks.
        result = await asyncio.to_thread(
            get_multicloud_service().configure_copilot_studio,
            tenant_id=request.tenant_id,
            client_id=request.client_id,
            client_secret=request.client_secret,
            environment_id=request.environment_id,
            monthly_capacity_cost=request.monthly_capacity_cost,
        )
    except InvalidConnectorIdentifierError as exc:
        raise _reject_identifier(exc) from exc
    if not result.saved:
        raise HTTPException(status_code=500, detail="Failed to save Copilot Studio credentials to Secrets Manager.")
    return _configured_response("Copilot Studio", result)


@router.delete("/configure/servicenow", response_model=ConfigureResponse)
async def delete_servicenow_config(_=Depends(require_admin)):
    """Delete ServiceNow connector configuration."""
    try:
        import boto3
        client = boto3.client("secretsmanager", region_name=_connector_secrets_region())
        client.delete_secret(SecretId="ava/connectors/servicenow", ForceDeleteWithoutRecovery=True)
        return ConfigureResponse(success=True, message="ServiceNow connector configuration deleted.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete ServiceNow config: {str(e)}")


@router.delete("/configure/salesforce", response_model=ConfigureResponse)
async def delete_salesforce_config(_=Depends(require_admin)):
    """Delete Salesforce connector configuration."""
    try:
        import boto3
        client = boto3.client("secretsmanager", region_name=_connector_secrets_region())
        client.delete_secret(SecretId="ava/connectors/salesforce", ForceDeleteWithoutRecovery=True)
        return ConfigureResponse(success=True, message="Salesforce connector configuration deleted.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete Salesforce config: {str(e)}")


@router.delete("/configure/copilot-studio", response_model=ConfigureResponse)
async def delete_copilot_studio_config(_=Depends(require_admin)):
    """Delete Copilot Studio connector configuration."""
    try:
        import boto3
        client = boto3.client("secretsmanager", region_name=_connector_secrets_region())
        client.delete_secret(SecretId="ava/connectors/copilot-studio", ForceDeleteWithoutRecovery=True)
        return ConfigureResponse(success=True, message="Copilot Studio connector configuration deleted.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete Copilot Studio config: {str(e)}")
