"""
LiteLLM Provisioning Service for virtual key management.

Creates, manages, and revokes LiteLLM virtual keys tied to use case
deployments. Each virtual key has an associated budget (monthly limit in USD),
model access restrictions, and metadata tags. Keys are stored in AWS Secrets
Manager for secure retrieval by agents at runtime.

Key features:
- Per-use-case virtual key provisioning via LiteLLM POST /key/generate
- Key revocation via LiteLLM POST /key/delete with Secrets Manager cleanup
- Budget updates via LiteLLM POST /key/update
- Key listing with optional team filter
- Team-level budget aggregate cap validation
- Retry logic with exponential backoff (3 retries: 1s, 2s, 4s delays)
- AWS Secrets Manager storage with use_case, team, and timestamp tags
- Uniqueness enforcement: prevents duplicate active keys per use case
"""

import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import boto3
import requests

logger = logging.getLogger(__name__)

# Default retry configuration
DEFAULT_MAX_RETRIES = 3
DEFAULT_BACKOFF_BASE_SECONDS = 1.0

# Secrets Manager naming convention for virtual keys
SECRET_NAME_PREFIX = "litellm"


@dataclass
class BudgetConfig:
    """Budget configuration for a virtual key.

    Attributes:
        max_budget: Maximum monthly budget in USD.
        budget_duration: Budget reset period (e.g., "monthly", "daily").
        rpm_limit: Requests per minute limit (default 100).
        tpm_limit: Tokens per minute limit (default 100,000).
    """

    max_budget: float
    budget_duration: str = "monthly"
    rpm_limit: int = 100
    tpm_limit: int = 100_000


@dataclass
class VirtualKeyResult:
    """Result of a virtual key provisioning operation.

    Attributes:
        key: The generated virtual key string.
        key_name: The LiteLLM key name/alias.
        secret_name: The Secrets Manager secret name where the key is stored.
        use_case: The use case this key is scoped to.
        team: The team this key belongs to.
        created_at: ISO timestamp of key creation.
    """

    key: str
    key_name: str
    secret_name: str
    use_case: str
    team: str
    created_at: str


@dataclass
class VirtualKeyInfo:
    """Information about a virtual key returned from list operations.

    Attributes:
        key_alias: The LiteLLM key alias/name.
        use_case: The use case this key is scoped to (from metadata).
        team: The team this key belongs to (from metadata).
        max_budget: Maximum monthly budget in USD.
        spend: Current spend against the budget.
        models: List of allowed models.
        rpm_limit: Requests per minute limit.
        tpm_limit: Tokens per minute limit.
        created_at: ISO timestamp of key creation.
        token: The key token identifier (hashed).
    """

    key_alias: str
    use_case: str
    team: str
    max_budget: float
    spend: float
    models: List[str]
    rpm_limit: Optional[int] = None
    tpm_limit: Optional[int] = None
    created_at: Optional[str] = None
    token: Optional[str] = None


@dataclass
class TeamBudgetConfig:
    """Team-level budget configuration.

    Attributes:
        team: The team identifier.
        max_budget: Maximum aggregate budget for all use cases in the team.
    """

    team: str
    max_budget: float


class ProvisioningError(Exception):
    """Raised when virtual key provisioning fails after all retries."""

    pass


class DuplicateKeyError(Exception):
    """Raised when attempting to create a duplicate active key for a use case."""

    pass


class KeyRevocationError(Exception):
    """Raised when key revocation fails."""

    pass


class BudgetCapExceededError(Exception):
    """Raised when a budget allocation would exceed the team's aggregate cap."""

    pass


class LiteLLMProvisioningService:
    """Provisions and manages LiteLLM virtual keys for use case deployments.

    This service handles the lifecycle of virtual keys:
    1. Creates keys via the LiteLLM POST /key/generate API
    2. Stores keys in AWS Secrets Manager with appropriate tags
    3. Enforces uniqueness (one active key per use case)
    4. Retries on transient failures with exponential backoff
    """

    def __init__(
        self,
        gateway_url: str,
        master_key: str,
        region: str = "us-east-2",
        secrets_client: Optional[Any] = None,
        max_retries: int = DEFAULT_MAX_RETRIES,
        backoff_base: float = DEFAULT_BACKOFF_BASE_SECONDS,
        http_session: Optional[requests.Session] = None,
    ):
        """Initialize the provisioning service.

        Args:
            gateway_url: The LiteLLM gateway base URL (e.g., "https://gateway.internal:4000").
            master_key: The LiteLLM master/admin key for authenticating API calls.
            region: AWS region for Secrets Manager (default: "us-east-2").
            secrets_client: Optional boto3 Secrets Manager client (created lazily if not provided).
            max_retries: Maximum number of retry attempts on failure (default: 3).
            backoff_base: Base delay in seconds for exponential backoff (default: 1.0).
            http_session: Optional requests.Session for HTTP calls (created if not provided).
        """
        self._gateway_url = gateway_url.rstrip("/")
        self._master_key = master_key
        self._region = region
        self._secrets_client = secrets_client
        self._max_retries = max_retries
        self._backoff_base = backoff_base
        self._http_session = http_session

    @property
    def secrets_client(self):
        """Lazily create Secrets Manager client if not injected."""
        if self._secrets_client is None:
            self._secrets_client = boto3.client(
                "secretsmanager", region_name=self._region
            )
        return self._secrets_client

    @property
    def http_session(self) -> requests.Session:
        """Lazily create HTTP session if not injected."""
        if self._http_session is None:
            self._http_session = requests.Session()
        return self._http_session

    def provision_key(
        self,
        use_case: str,
        team: str,
        budget: BudgetConfig,
        models: List[str],
    ) -> VirtualKeyResult:
        """Create a virtual key with budget and model scope for a use case.

        This method:
        1. Checks for an existing active key (uniqueness enforcement)
        2. Calls LiteLLM POST /key/generate with budget, models, and metadata
        3. Stores the generated key in Secrets Manager with tags
        4. Retries up to max_retries times with exponential backoff on failure

        Args:
            use_case: The use case identifier (e.g., "kyc_banking").
            team: The team identifier (e.g., "fsi-compliance").
            budget: Budget configuration including monthly limit and rate limits.
            models: List of model identifiers this key can access.

        Returns:
            VirtualKeyResult with the generated key details and secret name.

        Raises:
            DuplicateKeyError: If an active key already exists for this use case.
            ProvisioningError: If key creation fails after all retries.
        """
        # Enforce uniqueness: check for existing active key
        existing_key = self._check_existing_key(use_case)
        if existing_key is not None:
            raise DuplicateKeyError(
                f"An active virtual key already exists for use case '{use_case}'. "
                f"Secret: {existing_key}"
            )

        # Generate key via LiteLLM API with retry logic
        created_at = datetime.now(timezone.utc).isoformat()
        key_name = f"{use_case}-key"

        key_data = self._generate_key_with_retry(
            key_name=key_name,
            use_case=use_case,
            team=team,
            budget=budget,
            models=models,
        )

        virtual_key = key_data["key"]

        # Store in Secrets Manager
        secret_name = self._build_secret_name(use_case)
        self._store_key_in_secrets_manager(
            secret_name=secret_name,
            virtual_key=virtual_key,
            use_case=use_case,
            team=team,
            budget=budget,
            models=models,
            created_at=created_at,
        )

        logger.info(
            "Provisioned virtual key for use_case=%s, team=%s, secret=%s",
            use_case,
            team,
            secret_name,
        )

        return VirtualKeyResult(
            key=virtual_key,
            key_name=key_name,
            secret_name=secret_name,
            use_case=use_case,
            team=team,
            created_at=created_at,
        )

    def _check_existing_key(self, use_case: str) -> Optional[str]:
        """Check if an active key already exists for the given use case.

        Looks for an existing secret in Secrets Manager with the expected
        naming convention. Returns the secret name if found, None otherwise.

        Args:
            use_case: The use case identifier.

        Returns:
            The secret name if an active key exists, None otherwise.
        """
        secret_name = self._build_secret_name(use_case)
        try:
            response = self.secrets_client.describe_secret(SecretId=secret_name)
            # Check if the secret is not marked for deletion
            if response.get("DeletedDate") is None:
                return secret_name
            return None
        except self.secrets_client.exceptions.ResourceNotFoundException:
            return None
        except Exception as e:
            # Log but don't block provisioning on lookup failure
            logger.warning(
                "Failed to check existing key for use_case=%s: %s",
                use_case,
                str(e),
            )
            return None

    def _generate_key_with_retry(
        self,
        key_name: str,
        use_case: str,
        team: str,
        budget: BudgetConfig,
        models: List[str],
    ) -> Dict[str, Any]:
        """Call LiteLLM POST /key/generate with retry logic.

        Retries up to max_retries times with exponential backoff delays:
        - Attempt 0: immediate
        - Attempt 1: backoff_base * 2^0 = 1s
        - Attempt 2: backoff_base * 2^1 = 2s
        - Attempt 3: backoff_base * 2^2 = 4s

        Args:
            key_name: The key alias/name.
            use_case: The use case identifier.
            team: The team identifier.
            budget: Budget configuration.
            models: Allowed model list.

        Returns:
            The JSON response dict from LiteLLM containing the generated key.

        Raises:
            ProvisioningError: If all retries are exhausted.
        """
        payload = {
            "key_alias": key_name,
            "max_budget": budget.max_budget,
            "budget_duration": budget.budget_duration,
            "models": models,
            "rpm_limit": budget.rpm_limit,
            "tpm_limit": budget.tpm_limit,
            "metadata": {
                "use_case": use_case,
                "team": team,
            },
        }

        headers = {
            "Authorization": f"Bearer {self._master_key}",
            "Content-Type": "application/json",
        }

        url = f"{self._gateway_url}/key/generate"
        last_error: Optional[Exception] = None

        for attempt in range(self._max_retries + 1):
            if attempt > 0:
                delay = self._backoff_base * (2 ** (attempt - 1))
                logger.info(
                    "Retry attempt %d/%d for key generation "
                    "(use_case=%s), waiting %.1fs",
                    attempt,
                    self._max_retries,
                    use_case,
                    delay,
                )
                time.sleep(delay)

            try:
                response = self.http_session.post(
                    url,
                    json=payload,
                    headers=headers,
                    timeout=30,
                )
                response.raise_for_status()
                return response.json()

            except (requests.RequestException, ValueError) as e:
                last_error = e
                logger.warning(
                    "Key generation attempt %d/%d failed for use_case=%s: %s",
                    attempt + 1,
                    self._max_retries + 1,
                    use_case,
                    str(e),
                )

        # All retries exhausted
        error_msg = (
            f"Failed to generate virtual key for use_case='{use_case}' "
            f"after {self._max_retries + 1} attempts. "
            f"Last error: {last_error}"
        )
        logger.error(error_msg)
        raise ProvisioningError(error_msg)

    def _store_key_in_secrets_manager(
        self,
        secret_name: str,
        virtual_key: str,
        use_case: str,
        team: str,
        budget: BudgetConfig,
        models: List[str],
        created_at: str,
    ) -> None:
        """Store the virtual key in AWS Secrets Manager with tags.

        Creates or updates a secret containing the virtual key and its
        metadata. Tags the secret with use_case, team, and creation_timestamp.

        Args:
            secret_name: The Secrets Manager secret name.
            virtual_key: The generated LiteLLM virtual key.
            use_case: The use case identifier.
            team: The team identifier.
            budget: Budget configuration.
            models: Allowed model list.
            created_at: ISO timestamp of creation.
        """
        secret_value = json.dumps({
            "litellm_virtual_key": virtual_key,
            "use_case_id": use_case,
            "team_id": team,
            "gateway_endpoint": self._gateway_url,
            "monthly_budget_usd": budget.max_budget,
            "models": models,
            "created_at": created_at,
            "created_by": "control-plane-provisioner",
        })

        tags = [
            {"Key": "use_case", "Value": use_case},
            {"Key": "team", "Value": team},
            {"Key": "creation_timestamp", "Value": created_at},
            {"Key": "managed_by", "Value": "litellm-provisioning-service"},
        ]

        try:
            self.secrets_client.create_secret(
                Name=secret_name,
                SecretString=secret_value,
                Tags=tags,
            )
        except self.secrets_client.exceptions.ResourceAlreadyExistsException:
            # Secret exists (possibly previously deleted and restored)
            self.secrets_client.put_secret_value(
                SecretId=secret_name,
                SecretString=secret_value,
            )
            # Update tags on existing secret
            self.secrets_client.tag_resource(
                SecretId=secret_name,
                Tags=tags,
            )

        logger.info(
            "Stored virtual key in Secrets Manager: %s", secret_name
        )

    def revoke_key(self, use_case: str) -> None:
        """Revoke the virtual key for a use case and remove from Secrets Manager.

        This method:
        1. Retrieves the key from Secrets Manager to get the token
        2. Calls LiteLLM POST /key/delete to revoke the key
        3. Deletes the Secrets Manager entry
        The entire operation must complete within 60 seconds.

        Args:
            use_case: The use case identifier whose key should be revoked.

        Raises:
            KeyRevocationError: If key revocation fails.
        """
        secret_name = self._build_secret_name(use_case)
        start_time = time.time()
        timeout = 60.0

        try:
            # Step 1: Retrieve the key from Secrets Manager
            secret_response = self.secrets_client.get_secret_value(
                SecretId=secret_name
            )
            secret_data = json.loads(secret_response["SecretString"])
            virtual_key = secret_data["litellm_virtual_key"]

            # Check timeout
            elapsed = time.time() - start_time
            if elapsed >= timeout:
                raise KeyRevocationError(
                    f"Key revocation timed out for use_case='{use_case}' "
                    f"(elapsed: {elapsed:.1f}s, limit: {timeout}s)"
                )

            # Step 2: Call LiteLLM POST /key/delete
            headers = {
                "Authorization": f"Bearer {self._master_key}",
                "Content-Type": "application/json",
            }
            url = f"{self._gateway_url}/key/delete"
            payload = {"keys": [virtual_key]}

            response = self.http_session.post(
                url,
                json=payload,
                headers=headers,
                timeout=30,
            )
            response.raise_for_status()

            # Check timeout
            elapsed = time.time() - start_time
            if elapsed >= timeout:
                raise KeyRevocationError(
                    f"Key revocation timed out for use_case='{use_case}' "
                    f"(elapsed: {elapsed:.1f}s, limit: {timeout}s)"
                )

            # Step 3: Delete the Secrets Manager entry
            self.secrets_client.delete_secret(
                SecretId=secret_name,
                ForceDeleteWithoutRecovery=True,
            )

            # Final timeout check
            elapsed = time.time() - start_time
            if elapsed >= timeout:
                raise KeyRevocationError(
                    f"Key revocation timed out for use_case='{use_case}' "
                    f"(elapsed: {elapsed:.1f}s, limit: {timeout}s)"
                )

            logger.info(
                "Revoked virtual key for use_case=%s, secret=%s (%.1fs)",
                use_case,
                secret_name,
                elapsed,
            )

        except KeyRevocationError:
            raise
        except self.secrets_client.exceptions.ResourceNotFoundException:
            raise KeyRevocationError(
                f"No active key found for use_case='{use_case}' "
                f"(secret '{secret_name}' not found)"
            )
        except (requests.RequestException, ValueError) as e:
            raise KeyRevocationError(
                f"Failed to revoke key for use_case='{use_case}': {e}"
            )
        except Exception as e:
            raise KeyRevocationError(
                f"Unexpected error revoking key for use_case='{use_case}': {e}"
            )

    def update_budget(self, use_case: str, budget: BudgetConfig) -> None:
        """Update budget allocation for an existing key via LiteLLM API.

        Retrieves the current key from Secrets Manager, then calls
        LiteLLM POST /key/update to modify the budget parameters.

        Args:
            use_case: The use case identifier whose budget should be updated.
            budget: The new budget configuration to apply.

        Raises:
            ProvisioningError: If the budget update fails.
        """
        secret_name = self._build_secret_name(use_case)

        try:
            # Retrieve the key from Secrets Manager
            secret_response = self.secrets_client.get_secret_value(
                SecretId=secret_name
            )
            secret_data = json.loads(secret_response["SecretString"])
            virtual_key = secret_data["litellm_virtual_key"]

            # Call LiteLLM POST /key/update
            headers = {
                "Authorization": f"Bearer {self._master_key}",
                "Content-Type": "application/json",
            }
            url = f"{self._gateway_url}/key/update"
            payload = {
                "key": virtual_key,
                "max_budget": budget.max_budget,
                "budget_duration": budget.budget_duration,
                "rpm_limit": budget.rpm_limit,
                "tpm_limit": budget.tpm_limit,
            }

            response = self.http_session.post(
                url,
                json=payload,
                headers=headers,
                timeout=30,
            )
            response.raise_for_status()

            # Update the Secrets Manager entry with new budget info
            secret_data["monthly_budget_usd"] = budget.max_budget
            self.secrets_client.put_secret_value(
                SecretId=secret_name,
                SecretString=json.dumps(secret_data),
            )

            logger.info(
                "Updated budget for use_case=%s: max_budget=%.2f, "
                "budget_duration=%s, rpm_limit=%d, tpm_limit=%d",
                use_case,
                budget.max_budget,
                budget.budget_duration,
                budget.rpm_limit,
                budget.tpm_limit,
            )

        except self.secrets_client.exceptions.ResourceNotFoundException:
            raise ProvisioningError(
                f"No active key found for use_case='{use_case}' "
                f"(secret '{secret_name}' not found)"
            )
        except (requests.RequestException, ValueError) as e:
            raise ProvisioningError(
                f"Failed to update budget for use_case='{use_case}': {e}"
            )

    def list_keys(self, team: Optional[str] = None) -> List[VirtualKeyInfo]:
        """List all virtual keys, optionally filtered by team.

        Calls LiteLLM GET /key/list to retrieve key information.
        If a team filter is provided, only keys belonging to that team
        are returned.

        Args:
            team: Optional team identifier to filter by.

        Returns:
            List of VirtualKeyInfo objects.

        Raises:
            ProvisioningError: If the API call fails.
        """
        headers = {
            "Authorization": f"Bearer {self._master_key}",
            "Content-Type": "application/json",
        }
        url = f"{self._gateway_url}/key/list"

        try:
            response = self.http_session.get(
                url,
                headers=headers,
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()

            # LiteLLM returns a list of key objects
            keys_data = data if isinstance(data, list) else data.get("keys", [])

            results = []
            for key_entry in keys_data:
                # Skip entries that aren't dictionaries (e.g., raw key strings)
                if not isinstance(key_entry, dict):
                    continue
                metadata = key_entry.get("metadata") or {}
                # metadata may itself be a string in some LiteLLM versions
                if isinstance(metadata, str):
                    metadata = {}
                key_team = metadata.get("team", "")
                key_use_case = metadata.get("use_case", "")

                # Apply team filter if specified
                if team is not None and key_team != team:
                    continue

                results.append(
                    VirtualKeyInfo(
                        key_alias=key_entry.get("key_alias", key_entry.get("key_name", "")),
                        use_case=key_use_case,
                        team=key_team,
                        max_budget=key_entry.get("max_budget", 0.0),
                        spend=key_entry.get("spend", 0.0),
                        models=key_entry.get("models", []),
                        rpm_limit=key_entry.get("rpm_limit"),
                        tpm_limit=key_entry.get("tpm_limit"),
                        created_at=key_entry.get("created_at"),
                        token=key_entry.get("token"),
                    )
                )

            logger.info(
                "Listed %d virtual keys (team_filter=%s)",
                len(results),
                team,
            )
            return results

        except (requests.RequestException, ValueError) as e:
            raise ProvisioningError(
                f"Failed to list virtual keys: {e}"
            )

    def validate_team_budget_cap(
        self,
        team: str,
        team_budget_cap: float,
        new_use_case_budget: float,
        exclude_use_case: Optional[str] = None,
    ) -> None:
        """Validate that adding a new use case budget won't exceed team cap.

        Sums the budgets of all existing keys for the team and checks
        whether adding the new_use_case_budget would exceed team_budget_cap.

        Args:
            team: The team identifier.
            team_budget_cap: The maximum aggregate budget for the team.
            new_use_case_budget: The budget for the new use case being added.
            exclude_use_case: Optional use case to exclude from sum
                (useful when updating an existing key's budget).

        Raises:
            BudgetCapExceededError: If the new allocation would exceed the cap.
            ProvisioningError: If unable to retrieve existing key information.
        """
        existing_keys = self.list_keys(team=team)

        # Sum existing budgets, excluding the specified use case if given
        existing_budget_sum = sum(
            k.max_budget
            for k in existing_keys
            if k.use_case != exclude_use_case
        )

        total_projected = existing_budget_sum + new_use_case_budget

        if total_projected > team_budget_cap:
            raise BudgetCapExceededError(
                f"Adding budget ${new_use_case_budget:.2f} for team '{team}' "
                f"would exceed team cap of ${team_budget_cap:.2f}. "
                f"Current allocated: ${existing_budget_sum:.2f}, "
                f"projected total: ${total_projected:.2f}"
            )

        logger.info(
            "Team budget validation passed for team=%s: "
            "existing=%.2f + new=%.2f = %.2f <= cap=%.2f",
            team,
            existing_budget_sum,
            new_use_case_budget,
            total_projected,
            team_budget_cap,
        )

    @staticmethod
    def _build_secret_name(use_case: str) -> str:
        """Build the Secrets Manager secret name for a use case.

        Args:
            use_case: The use case identifier.

        Returns:
            The formatted secret name (e.g., "litellm-kyc_banking-key").
        """
        return f"{SECRET_NAME_PREFIX}-{use_case}-key"
