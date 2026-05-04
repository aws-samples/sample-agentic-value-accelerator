"""
Langfuse Project Provisioning Service.

Creates per-use-case Langfuse projects with dedicated API keys
and stores them in AWS Secrets Manager.

Uses Langfuse's internal tRPC API with session auth (via the auto-login
Lambda@Edge on CloudFront) to create projects and API keys.
"""

import json
import logging

import boto3
import requests

logger = logging.getLogger(__name__)


class LangfuseProvisioningService:
    """Provisions Langfuse projects and API keys for use cases."""

    def __init__(self, langfuse_host: str, langfuse_secret_name: str, region: str):
        self.langfuse_host = langfuse_host.rstrip("/")
        self.langfuse_secret_name = langfuse_secret_name
        self.region = region
        self._sm = boto3.client("secretsmanager", region_name=region)
        self._session = None

    def _get_session(self) -> requests.Session:
        """Get an authenticated session via Langfuse's CSRF/auto-login flow."""
        if self._session:
            return self._session

        session = requests.Session()
        # Get CSRF token
        r = session.get(f"{self.langfuse_host}/api/auth/csrf", timeout=10)
        r.raise_for_status()
        csrf = r.json().get("csrfToken", "")

        # Trigger session creation via credentials callback
        # The auto-login Lambda@Edge handles actual authentication
        session.post(
            f"{self.langfuse_host}/api/auth/callback/credentials",
            data={"csrfToken": csrf, "email": "admin@langfuse.com", "password": "x", "callbackUrl": self.langfuse_host},
            timeout=10,
            allow_redirects=False,
        )

        # Verify session
        r = session.get(f"{self.langfuse_host}/api/auth/session", timeout=10)
        if r.status_code != 200 or not r.json().get("user"):
            raise RuntimeError("Failed to establish Langfuse session")

        self._session = session
        return session

    def provision_project(self, use_case_name: str) -> dict:
        """
        Create a Langfuse project for a use case and store its API keys.

        Args:
            use_case_name: The use case identifier (e.g., "kyc_banking")

        Returns:
            Dict with secret_name, public_key, project_name
        """
        project_name = f"fsi-{use_case_name}"
        secret_name = f"langfuse-{use_case_name}-keys"

        # Check if keys already exist in Secrets Manager
        try:
            existing = self._sm.get_secret_value(SecretId=secret_name)
            existing_keys = json.loads(existing["SecretString"])
            if existing_keys.get("langfuse_public_key") and existing_keys.get("langfuse_secret_key"):
                logger.info(f"Langfuse keys already exist for {use_case_name}, reusing")
                return {
                    "secret_name": secret_name,
                    "public_key": existing_keys["langfuse_public_key"],
                    "project_name": project_name,
                }
        except self._sm.exceptions.ResourceNotFoundException:
            pass

        session = self._get_session()

        # Create project via tRPC
        r = session.post(
            f"{self.langfuse_host}/api/trpc/projects.create",
            json={"json": {"name": project_name, "orgId": "seed-org"}},
            timeout=10,
        )
        if r.status_code == 200:
            project_id = r.json()["result"]["data"]["json"]["id"]
            logger.info(f"Created Langfuse project: {project_name} ({project_id})")
        else:
            # Project might already exist — list and find it
            logger.info(f"Project creation returned {r.status_code}, checking if it exists")
            r2 = requests.get(
                f"{self.langfuse_host}/api/public/projects",
                auth=(self._get_seed_keys()),
                timeout=10,
            )
            projects = r2.json().get("data", [])
            project = next((p for p in projects if p["name"] == project_name), None)
            if not project:
                raise RuntimeError(f"Failed to create or find project {project_name}: {r.text[:200]}")
            project_id = project["id"]
            logger.info(f"Found existing Langfuse project: {project_name} ({project_id})")

        # Create API keys for the project via tRPC
        r = session.post(
            f"{self.langfuse_host}/api/trpc/projectApiKeys.create",
            json={"json": {"projectId": project_id}},
            timeout=10,
        )
        r.raise_for_status()
        key_data = r.json()["result"]["data"]["json"]
        public_key = key_data["publicKey"]
        secret_key = key_data["secretKey"]
        logger.info(f"Created API keys for project {project_name}")

        # Store in Secrets Manager
        secret_value = json.dumps({
            "langfuse_public_key": public_key,
            "langfuse_secret_key": secret_key,
            "langfuse_project_name": project_name,
            "langfuse_project_id": project_id,
        })
        try:
            self._sm.create_secret(
                Name=secret_name,
                SecretString=secret_value,
                Tags=[
                    {"Key": "use_case", "Value": use_case_name},
                    {"Key": "managed_by", "Value": "fsi-agent-kit"},
                ],
            )
        except self._sm.exceptions.ResourceAlreadyExistsException:
            self._sm.put_secret_value(SecretId=secret_name, SecretString=secret_value)

        logger.info(f"Stored Langfuse keys in secret: {secret_name}")

        return {
            "secret_name": secret_name,
            "public_key": public_key,
            "project_name": project_name,
        }

    def _get_seed_keys(self):
        """Get seed project keys for API auth fallback."""
        secret = json.loads(self._sm.get_secret_value(SecretId=self.langfuse_secret_name)["SecretString"])
        return (secret.get("langfuse_public_key", ""), secret.get("langfuse_secret_key", ""))
