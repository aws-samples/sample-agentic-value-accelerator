"""
LLM Gateway Virtual-Key Provisioning Service.

Mints a per-deployment LiteLLM virtual key for each Foundry use case
deploy so every agent gets its own attributable spend, budget, and
audit trail. Mirrors the LangfuseProvisioningService shape — Control
Plane calls provision_virtual_key(...) before kicking the pipeline,
stores the resulting Secrets Manager secret ARN, and the AgentCore
runtime resolves the key from that ARN at runtime via
foundations/src/utils/llm_gateway.py.

When no LLM Gateway is deployed in the same account / region, the
provisioning step is a no-op — Foundry use cases keep using direct
Bedrock (unchanged behavior). This service is purely additive.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Dict, List, Optional

import boto3

from core import safe_fetch
from core.safe_fetch import SafeFetchError

logger = logging.getLogger(__name__)


class LLMGatewayProvisioningService:
    """Provisions LiteLLM virtual keys for FSI Foundry deployments."""

    def __init__(self, region: str, deployments_table_name: str):
        self.region = region
        self.deployments_table_name = deployments_table_name
        self._sm = boto3.client("secretsmanager", region_name=region)
        self._ddb = boto3.resource("dynamodb", region_name=region).Table(deployments_table_name)
        self._cached_gateway: Optional[Dict[str, str]] = None

    # ------------------------------------------------------------------
    # Gateway discovery
    # ------------------------------------------------------------------

    def find_active_gateway(self) -> Optional[Dict[str, str]]:
        """Find the most recently deployed `llm-gateway` instance.

        Returns a dict with endpoint, master_key_secret_arn, region — or
        None if no gateway is deployed. Cached on the service instance
        so repeat deploys in the same Control Plane request don't
        re-scan DynamoDB.
        """
        if self._cached_gateway is not None:
            return self._cached_gateway or None

        try:
            resp = self._ddb.scan(
                FilterExpression="template_id = :t AND #s = :status",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":t": "llm-gateway",
                    ":status": "deployed",
                },
            )
            items = resp.get("Items", []) or []
            if not items:
                logger.info("llm_gateway_provisioning: no deployed gateway found")
                self._cached_gateway = {}
                return None

            # Pick the most recently created
            items.sort(key=lambda i: str(i.get("created_at", "")), reverse=True)
            inst = items[0]
            outputs = inst.get("outputs") or {}
            endpoint = str(outputs.get("gateway_endpoint", ""))
            master_secret = str(outputs.get("master_key_secret_arn", ""))

            if not endpoint or not master_secret:
                logger.warning(
                    "llm_gateway_provisioning: found gateway %s but outputs incomplete",
                    inst.get("deployment_id"),
                )
                self._cached_gateway = {}
                return None

            result = {
                "deployment_id": str(inst.get("deployment_id", "")),
                "endpoint": endpoint,
                "master_key_secret_arn": master_secret,
                "region": str(inst.get("region", self.region)),
            }
            self._cached_gateway = result
            return result
        except Exception as exc:
            logger.warning("llm_gateway_provisioning: gateway discovery failed: %s", exc)
            self._cached_gateway = {}
            return None

    # ------------------------------------------------------------------
    # Virtual key lifecycle
    # ------------------------------------------------------------------

    def provision_virtual_key(
        self,
        use_case_name: str,
        framework: str,
        deployment_id: str,
        enabled_models: Optional[List[str]] = None,
        max_budget_usd: float = 100.0,
        budget_duration: str = "30d",
    ) -> Optional[Dict[str, str]]:
        """Mint a virtual key on the gateway and write it to Secrets Manager.

        Returns:
            dict with gateway_endpoint + virtual_key_secret_arn, or None
            if no gateway is deployed / minting failed. Callers should
            treat None as "skip gateway routing for this deployment".
        """
        gateway = self.find_active_gateway()
        if not gateway:
            return None

        # Sanitize names — Secrets Manager limits to 512 chars; we keep
        # them short + grep-friendly so the agentcore IAM policy
        # `secret:llm-gateway-*` matches.
        safe_id = re.sub(r"[^a-zA-Z0-9_-]", "-", deployment_id)[:8]
        safe_uc = re.sub(r"[^a-zA-Z0-9_-]", "-", use_case_name)[:24]
        safe_fw = re.sub(r"[^a-zA-Z0-9_-]", "-", framework)[:16]
        secret_name = f"llm-gateway-foundry-{safe_uc}-{safe_fw}-{safe_id}"

        # Idempotency — if a secret already exists for this deployment,
        # reuse it. Avoids leaking virtual keys on redeploy.
        try:
            existing = self._sm.get_secret_value(SecretId=secret_name)
            data = json.loads(existing.get("SecretString", "{}"))
            if data.get("key"):
                logger.info("llm_gateway_provisioning: reusing existing key %s", secret_name)
                return {
                    "gateway_endpoint": gateway["endpoint"],
                    "virtual_key_secret_arn": existing.get("ARN", ""),
                    "virtual_key_secret_name": secret_name,
                }
        except self._sm.exceptions.ResourceNotFoundException:
            pass
        except Exception as exc:
            logger.debug("llm_gateway_provisioning: secret check failed: %s", exc)

        # Resolve the gateway master key so we can authenticate the
        # /key/generate call.
        try:
            master = self._sm.get_secret_value(SecretId=gateway["master_key_secret_arn"])
            master_key = json.loads(master["SecretString"]).get("master_key", "")
            if not master_key:
                logger.warning("llm_gateway_provisioning: master key empty")
                return None
        except Exception as exc:
            logger.warning("llm_gateway_provisioning: master key fetch failed: %s", exc)
            return None

        # Mint the virtual key via LiteLLM admin API
        try:
            payload = {
                "key_alias": f"foundry-{safe_uc}-{safe_fw}-{safe_id}",
                "metadata": {
                    "use_case": use_case_name,
                    "framework": framework,
                    "deployment_id": deployment_id,
                    "provisioned_by": "ava-control-plane",
                },
                "max_budget": max_budget_usd,
                "budget_duration": budget_duration,
            }
            if enabled_models:
                payload["models"] = enabled_models

            # fetch_internal, not fetch: `gateway["endpoint"]` is platform
            # configuration read out of our own deployment record, and depending on
            # the topology it is either a private ALB address or a public CloudFront
            # domain, so the address class is not a useful gate on it either way.
            # What fetch_internal buys us is that a redirect is an error instead of a
            # hop - urllib's redirect handler forwarded this Authorization header
            # verbatim, replaying the gateway master key to whatever host a 302
            # named. Nothing here validates the endpoint's shape, so this rests on
            # `outputs.gateway_endpoint` staying platform-written; a caller-supplied
            # URL would have to go through safe_fetch.fetch instead.
            resp = safe_fetch.fetch_internal(
                f"{gateway['endpoint'].rstrip('/')}/key/generate",
                method="POST",
                body=json.dumps(payload),
                headers={
                    "Authorization": f"Bearer {master_key}",
                    "Content-Type": "application/json",
                },
                timeout=15,
            )
            # urlopen raised on 4xx/5xx; fetch_internal returns the response, so an
            # error body would otherwise be parsed as if it were a minted key.
            if not (200 <= resp.status < 300):
                logger.warning(
                    "llm_gateway_provisioning: /key/generate returned status %s", resp.status
                )
                return None
            if resp.truncated:
                # A minted-key document does not approach safe_fetch's cap, so this
                # is not the gateway's answer at all. Say that, instead of letting it
                # surface as the invalid_json_response a cut body would otherwise
                # cause and reading "no key" out of a document we truncated.
                logger.warning(
                    "llm_gateway_provisioning: /key/generate body exceeded the read cap"
                )
                return None
            key_response = resp.json()

            virtual_key = key_response.get("key") or key_response.get("token", "")
            if not virtual_key:
                # %r, not %s: this is the gateway's own text, and a CR/LF in it would
                # forge a log record.
                logger.warning(
                    "llm_gateway_provisioning: /key/generate returned no key: %r",
                    str(key_response)[:200],
                )
                return None
        except SafeFetchError as exc:
            logger.warning(
                "llm_gateway_provisioning: /key/generate failed: %s (%s)", exc.reason, exc.detail
            )
            return None
        except Exception as exc:
            logger.warning("llm_gateway_provisioning: /key/generate failed: %s", exc)
            return None

        # Store the virtual key in Secrets Manager.
        secret_value = json.dumps({
            "key": virtual_key,
            "gateway_endpoint": gateway["endpoint"],
            "use_case": use_case_name,
            "framework": framework,
            "deployment_id": deployment_id,
        })

        try:
            create_resp = self._sm.create_secret(
                Name=secret_name,
                SecretString=secret_value,
                Tags=[
                    {"Key": "use_case", "Value": use_case_name},
                    {"Key": "framework", "Value": framework},
                    {"Key": "deployment_id", "Value": deployment_id},
                    {"Key": "managed_by", "Value": "ava-llm-gateway-provisioning"},
                ],
            )
            secret_arn = create_resp.get("ARN", "")
        except self._sm.exceptions.ResourceAlreadyExistsException:
            put_resp = self._sm.put_secret_value(SecretId=secret_name, SecretString=secret_value)
            secret_arn = put_resp.get("ARN", "")
        except Exception as exc:
            logger.warning("llm_gateway_provisioning: secret create failed: %s", exc)
            return None

        logger.info(
            "llm_gateway_provisioning: minted virtual key + stored secret",
            extra={"secret_name": secret_name, "use_case": use_case_name},
        )
        return {
            "gateway_endpoint": gateway["endpoint"],
            "virtual_key_secret_arn": secret_arn,
            "virtual_key_secret_name": secret_name,
        }

    # ------------------------------------------------------------------
    # Offboarding cleanup
    # ------------------------------------------------------------------

    def revoke_virtual_key(self, use_case_name: str, framework: str, deployment_id: str) -> None:
        """Delete the Secrets Manager secret + revoke the virtual key on the gateway.

        Called from the offboarding pipeline so a destroyed use case doesn't
        leave a spendable virtual key in circulation. Best-effort — failures
        are logged but never block destroy.
        """
        safe_id = re.sub(r"[^a-zA-Z0-9_-]", "-", deployment_id)[:8]
        safe_uc = re.sub(r"[^a-zA-Z0-9_-]", "-", use_case_name)[:24]
        safe_fw = re.sub(r"[^a-zA-Z0-9_-]", "-", framework)[:16]
        secret_name = f"llm-gateway-foundry-{safe_uc}-{safe_fw}-{safe_id}"

        # Fetch the virtual key for /key/delete before nuking the secret.
        virtual_key: Optional[str] = None
        try:
            existing = self._sm.get_secret_value(SecretId=secret_name)
            virtual_key = json.loads(existing.get("SecretString", "{}")).get("key")
        except Exception:
            pass

        # Revoke on the gateway.
        gateway = self.find_active_gateway()
        if gateway and virtual_key:
            try:
                master_resp = self._sm.get_secret_value(SecretId=gateway["master_key_secret_arn"])
                master_key = json.loads(master_resp["SecretString"]).get("master_key", "")
                if master_key:
                    payload = {"keys": [virtual_key]}
                    # Same reasoning as /key/generate above: a platform-configured
                    # endpoint whose address class proves nothing, and a redirect that
                    # must not become a hop carrying this Authorization header. The
                    # response body is still discarded, but fetch_internal closes the
                    # connection on its way out, which the bare urlopen(...).read() did
                    # not.
                    resp = safe_fetch.fetch_internal(
                        f"{gateway['endpoint'].rstrip('/')}/key/delete",
                        method="POST",
                        body=json.dumps(payload),
                        headers={
                            "Authorization": f"Bearer {master_key}",
                            "Content-Type": "application/json",
                        },
                        timeout=10,
                    )
                    # urlopen raised on 4xx/5xx, so the success log below only ever
                    # printed after an accepted delete. Keep it that way: a key that is
                    # still spendable must not be logged as revoked.
                    if 200 <= resp.status < 300:
                        logger.info(
                            "llm_gateway_provisioning: revoked virtual key %s", secret_name
                        )
                    else:
                        logger.warning(
                            "llm_gateway_provisioning: /key/delete returned status %s for %s",
                            resp.status,
                            secret_name,
                        )
            except SafeFetchError as exc:
                logger.warning(
                    "llm_gateway_provisioning: /key/delete failed: %s (%s)", exc.reason, exc.detail
                )
            except Exception as exc:
                logger.warning("llm_gateway_provisioning: /key/delete failed: %s", exc)

        # Delete the secret.
        try:
            self._sm.delete_secret(
                SecretId=secret_name,
                ForceDeleteWithoutRecovery=True,
            )
            logger.info("llm_gateway_provisioning: deleted secret %s", secret_name)
        except self._sm.exceptions.ResourceNotFoundException:
            pass
        except Exception as exc:
            logger.warning("llm_gateway_provisioning: secret delete failed: %s", exc)
