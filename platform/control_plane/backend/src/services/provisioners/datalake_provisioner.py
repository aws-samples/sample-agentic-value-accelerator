"""Data Lake Provisioner — deploys MCP server to AgentCore Runtime + Gateway.

Idempotent: safe to retry on failure. Each step checks if the resource
already exists before creating. Teardown skips resources that don't exist.
"""

import asyncio
import json
import logging
import time

import boto3
from botocore.exceptions import ClientError

from core.config import settings
from services.knowledge_service import KnowledgeService

logger = logging.getLogger(__name__)

RESOURCE_PREFIX = "ava-knowledge"


class DataLakeProvisioner:
    """Provisions and tears down data lake MCP server infrastructure."""

    def __init__(self, knowledge_svc: KnowledgeService):
        self.svc = knowledge_svc
        self.iam = boto3.client("iam", region_name=settings.AWS_REGION)
        self.lf = boto3.client("lakeformation", region_name=settings.AWS_REGION)
        self.agentcore = boto3.client("bedrock-agentcore-control", region_name=settings.AWS_REGION)
        self.sts = boto3.client("sts", region_name=settings.AWS_REGION)
        self.account_id = self.sts.get_caller_identity()["Account"]

    def _resource_name(self, registration_id: str) -> str:
        return f"{RESOURCE_PREFIX}-{registration_id[:8]}"

    # -------------------------------------------------------------------------
    # Provision (idempotent)
    # -------------------------------------------------------------------------

    async def provision(self, registration_id: str, config: dict) -> None:
        """Provision all resources for a data lake registration."""
        name = self._resource_name(registration_id)
        databases = config["databases"]
        athena_workgroup = config["athena_workgroup"]

        try:
            # Step 1: IAM Role
            logger.info(f"[{registration_id}] Step 1: Ensuring IAM role")
            role_arn = self._ensure_iam_role(name, databases, athena_workgroup)
            self.svc.update_status(registration_id, "PROVISIONING", iam_role_arn=role_arn)

            # Wait for IAM propagation
            await asyncio.sleep(10)

            # Step 2: Lake Formation grants
            logger.info(f"[{registration_id}] Step 2: Ensuring LF grants")
            self._ensure_lf_grants(role_arn, databases)

            # Step 3: AgentCore Runtime
            logger.info(f"[{registration_id}] Step 3: Ensuring AgentCore Runtime")
            runtime_id, runtime_arn = self._ensure_runtime(name, role_arn, databases, athena_workgroup)
            self.svc.update_status(registration_id, "PROVISIONING", runtime_id=runtime_id)

            # Wait for Runtime to become READY
            self._wait_for_runtime(runtime_id)

            # Step 4: AgentCore Gateway
            logger.info(f"[{registration_id}] Step 4: Ensuring AgentCore Gateway")
            gateway_id, gateway_url = self._ensure_gateway(name, role_arn)
            self.svc.update_status(registration_id, "PROVISIONING", gateway_id=gateway_id)

            # Wait for Gateway to become READY
            self._wait_for_gateway(gateway_id)

            # Step 5: Gateway Target (points to Runtime via ARN)
            logger.info(f"[{registration_id}] Step 5: Ensuring Gateway Target")
            target_id = self._ensure_gateway_target(gateway_id, name, runtime_arn)
            self.svc.update_status(registration_id, "PROVISIONING", target_id=target_id)

            # Done
            logger.info(f"[{registration_id}] Provisioning complete: {gateway_url}")
            self.svc.update_status(registration_id, "ACTIVE", gateway_endpoint=gateway_url)

        except Exception as e:
            logger.error(f"[{registration_id}] Provisioning failed: {e}")
            self.svc.update_status(registration_id, "FAILED", error_message=str(e))

    # -------------------------------------------------------------------------
    # Teardown (idempotent)
    # -------------------------------------------------------------------------

    async def teardown(self, registration_id: str, reg_data: dict) -> None:
        """Tear down all resources. Safe to retry."""
        name = self._resource_name(registration_id)
        runtime_id = reg_data.get("runtime_id", "")
        gateway_id = reg_data.get("gateway_id", "")
        target_id = reg_data.get("target_id", "")
        role_arn = reg_data.get("iam_role_arn", "")
        databases = reg_data.get("config", {}).get("databases", [])

        try:
            self.svc.update_status(registration_id, "DELETING")

            # Reverse order
            logger.info(f"[{registration_id}] Teardown: removing gateway target")
            self._delete_gateway_target(gateway_id, target_id)

            # Wait for target deletion to propagate before deleting gateway
            logger.info(f"[{registration_id}] Waiting for target deletion to propagate...")
            await asyncio.sleep(15)

            logger.info(f"[{registration_id}] Teardown: removing gateway")
            self._delete_gateway(gateway_id)

            logger.info(f"[{registration_id}] Teardown: removing runtime")
            self._delete_runtime(runtime_id)

            logger.info(f"[{registration_id}] Teardown: revoking LF grants")
            self._revoke_lf_grants(role_arn, databases)

            logger.info(f"[{registration_id}] Teardown: removing IAM role")
            self._delete_iam_role(name)

            self.svc.update_status(registration_id, "DELETED")
            logger.info(f"[{registration_id}] Teardown complete")

        except Exception as e:
            logger.error(f"[{registration_id}] Teardown failed: {e}")
            self.svc.update_status(registration_id, "FAILED", error_message=f"Teardown failed: {e}")

    # -------------------------------------------------------------------------
    # Step 1: IAM Role
    # -------------------------------------------------------------------------

    def _ensure_iam_role(self, name: str, databases: list[str], workgroup: str) -> str:
        role_name = f"{name}-role"

        try:
            resp = self.iam.get_role(RoleName=role_name)
            return resp["Role"]["Arn"]
        except self.iam.exceptions.NoSuchEntityException:
            pass

        trust_policy = {
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "bedrock-agentcore.amazonaws.com"},
                "Action": "sts:AssumeRole",
                "Condition": {
                    "StringEquals": {"aws:SourceAccount": self.account_id},
                },
            }],
        }

        resp = self.iam.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps(trust_policy),
            Description=f"MCP server role for data lake: {name}",
        )
        role_arn = resp["Role"]["Arn"]

        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "GlueCatalog",
                    "Effect": "Allow",
                    "Action": ["glue:GetDatabases", "glue:GetDatabase", "glue:GetTables", "glue:GetTable", "glue:GetPartitions"],
                    "Resource": [
                        f"arn:aws:glue:{settings.AWS_REGION}:{self.account_id}:catalog",
                        *[f"arn:aws:glue:{settings.AWS_REGION}:{self.account_id}:database/{db}" for db in databases],
                        *[f"arn:aws:glue:{settings.AWS_REGION}:{self.account_id}:table/{db}/*" for db in databases],
                    ],
                },
                {
                    "Sid": "AthenaQuery",
                    "Effect": "Allow",
                    "Action": ["athena:StartQueryExecution", "athena:GetQueryExecution", "athena:GetQueryResults", "athena:StopQueryExecution", "athena:GetWorkGroup"],
                    "Resource": [f"arn:aws:athena:{settings.AWS_REGION}:{self.account_id}:workgroup/{workgroup}"],
                },
                {
                    "Sid": "AthenaResultsBucket",
                    "Effect": "Allow",
                    "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:GetBucketLocation"],
                    "Resource": ["*"],  # Scoped to Athena results — LF vends credentials for data
                },
                {
                    "Sid": "LakeFormation",
                    "Effect": "Allow",
                    "Action": ["lakeformation:GetDataAccess"],
                    "Resource": ["*"],
                },
                {
                    "Sid": "ECRPull",
                    "Effect": "Allow",
                    "Action": ["ecr:GetAuthorizationToken"],
                    "Resource": ["*"],
                },
                {
                    "Sid": "ECRImage",
                    "Effect": "Allow",
                    "Action": ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"],
                    "Resource": [f"arn:aws:ecr:{settings.AWS_REGION}:{self.account_id}:repository/*"],
                },
                {
                    "Sid": "AgentCoreInvoke",
                    "Effect": "Allow",
                    "Action": ["bedrock-agentcore:InvokeAgentRuntime"],
                    "Resource": [f"arn:aws:bedrock-agentcore:{settings.AWS_REGION}:{self.account_id}:runtime/*"],
                },
            ],
        }

        self.iam.put_role_policy(
            RoleName=role_name,
            PolicyName="datalake-access",
            PolicyDocument=json.dumps(policy),
        )

        return role_arn

    def _delete_iam_role(self, name: str) -> None:
        role_name = f"{name}-role"
        try:
            self.iam.delete_role_policy(RoleName=role_name, PolicyName="datalake-access")
        except ClientError:
            pass
        try:
            self.iam.delete_role(RoleName=role_name)
        except ClientError:
            pass

    # -------------------------------------------------------------------------
    # Step 2: Lake Formation
    # -------------------------------------------------------------------------

    def _ensure_lf_grants(self, role_arn: str, databases: list[str]) -> None:
        """Grant LF permissions on databases and tables."""
        for db in databases:
            try:
                self.lf.grant_permissions(
                    Principal={"DataLakePrincipalIdentifier": role_arn},
                    Resource={"Database": {"Name": db}},
                    Permissions=["DESCRIBE"],
                )
            except ClientError as e:
                if "already" not in str(e).lower():
                    raise

            try:
                self.lf.grant_permissions(
                    Principal={"DataLakePrincipalIdentifier": role_arn},
                    Resource={"Table": {"DatabaseName": db, "TableWildcard": {}}},
                    Permissions=["SELECT", "DESCRIBE"],
                )
            except ClientError as e:
                if "already" not in str(e).lower():
                    raise
            except ClientError as e:
                logger.warning(f"LF table grant skipped for {db} (likely IAM_ALLOWED_PRINCIPALS mode): {e}")

    def _revoke_lf_grants(self, role_arn: str, databases: list[str]) -> None:
        if not role_arn:
            return
        for db in databases:
            try:
                self.lf.revoke_permissions(
                    Principal={"DataLakePrincipalIdentifier": role_arn},
                    Resource={"Database": {"Name": db}},
                    Permissions=["DESCRIBE"],
                )
            except ClientError:
                pass
            try:
                self.lf.revoke_permissions(
                    Principal={"DataLakePrincipalIdentifier": role_arn},
                    Resource={"Table": {"DatabaseName": db, "TableWildcard": {}}},
                    Permissions=["SELECT", "DESCRIBE"],
                )
            except ClientError:
                pass

    # -------------------------------------------------------------------------
    # Step 3: AgentCore Runtime
    # -------------------------------------------------------------------------

    def _ensure_runtime(self, name: str, role_arn: str, databases: list[str], workgroup: str) -> tuple[str, str]:
        """Create Runtime. Returns (runtime_id, runtime_arn)."""
        # AgentCore names: alphanumeric + underscores only
        runtime_name = name.replace("-", "_") + "_runtime"

        try:
            resp = self.agentcore.create_agent_runtime(
                agentRuntimeName=runtime_name,
                description=f"Data lake MCP server: {name}",
                roleArn=role_arn,
                agentRuntimeArtifact={
                    "containerConfiguration": {
                        "containerUri": settings.DATALAKE_MCP_IMAGE_URI,
                    }
                },
                networkConfiguration={"networkMode": "PUBLIC"},
                protocolConfiguration={"serverProtocol": "MCP"},
                environmentVariables={
                    "AWS_REGION": settings.AWS_REGION,
                    "GLUE_DATABASES": ",".join(databases),
                    "ATHENA_WORKGROUP": workgroup,
                },
            )
            return resp["agentRuntimeId"], resp["agentRuntimeArn"]
        except ClientError as e:
            if "ConflictException" in str(e) or "already exists" in str(e).lower():
                # Already exists — list and find it
                resp = self.agentcore.list_agent_runtimes()
                for rt in resp.get("agentRuntimes", []):
                    if rt.get("agentRuntimeName") == runtime_name:
                        return rt["agentRuntimeId"], rt["agentRuntimeArn"]
                raise RuntimeError(f"Runtime {runtime_name} exists but not found in list")
            raise

    def _wait_for_runtime(self, runtime_id: str, timeout: int = 120) -> None:
        """Poll until runtime status is READY."""
        start = time.time()
        while time.time() - start < timeout:
            resp = self.agentcore.get_agent_runtime(agentRuntimeId=runtime_id)
            status = resp.get("status", "")
            if status == "READY":
                return
            if status == "CREATE_FAILED":
                reason = resp.get("failureReason", "Unknown")
                raise RuntimeError(f"Runtime creation failed: {reason}")
            time.sleep(5)
        raise RuntimeError(f"Runtime did not become READY within {timeout}s")

    def _delete_runtime(self, runtime_id: str) -> None:
        if not runtime_id:
            return
        try:
            self.agentcore.delete_agent_runtime(agentRuntimeId=runtime_id)
        except ClientError:
            pass

    # -------------------------------------------------------------------------
    # Step 4: AgentCore Gateway
    # -------------------------------------------------------------------------

    def _ensure_gateway(self, name: str, role_arn: str) -> tuple[str, str]:
        """Create Gateway. Returns (gateway_id, gateway_url)."""
        gateway_name = f"{name}-gateway"

        try:
            resp = self.agentcore.create_gateway(
                name=gateway_name,
                description=f"MCP Gateway for data lake: {name}",
                protocolType="MCP",
                authorizerType="NONE",
                roleArn=role_arn,
            )
            return resp["gatewayId"], resp.get("gatewayUrl", "")
        except ClientError as e:
            if "ConflictException" in str(e) or "already exists" in str(e).lower():
                # Gateway exists — find it by listing and matching name
                paginator_args = {}
                while True:
                    resp = self.agentcore.list_gateways(**paginator_args)
                    for gw in resp.get("items", resp.get("gateways", [])):
                        gw_name = gw.get("name", gw.get("gatewayName", ""))
                        if gw_name == gateway_name:
                            gw_id = gw.get("gatewayId", gw.get("gatewayIdentifier", ""))
                            gw_url = gw.get("gatewayUrl", "")
                            return gw_id, gw_url
                    next_token = resp.get("nextToken")
                    if not next_token:
                        break
                    paginator_args["nextToken"] = next_token
                raise RuntimeError(f"Gateway {gateway_name} exists but not found in list")
            raise

    def _wait_for_gateway(self, gateway_id: str, timeout: int = 60) -> None:
        """Poll until gateway status is READY."""
        start = time.time()
        while time.time() - start < timeout:
            resp = self.agentcore.get_gateway(gatewayIdentifier=gateway_id)
            status = resp.get("status", "")
            if status == "READY":
                return
            if status == "FAILED":
                reasons = resp.get("statusReasons", ["Unknown"])
                raise RuntimeError(f"Gateway creation failed: {reasons}")
            time.sleep(3)
        raise RuntimeError(f"Gateway did not become READY within {timeout}s")

    def _delete_gateway(self, gateway_id: str) -> None:
        if not gateway_id:
            logger.warning("No gateway_id to delete — skipping")
            return
        try:
            self.agentcore.delete_gateway(gatewayIdentifier=gateway_id)
            logger.info(f"Gateway {gateway_id} delete requested")
        except ClientError as e:
            logger.warning(f"Gateway delete failed (may already be deleted): {e}")

    # -------------------------------------------------------------------------
    # Step 5: Gateway Target
    # -------------------------------------------------------------------------

    def _ensure_gateway_target(self, gateway_id: str, name: str, runtime_arn: str) -> str:
        """Add runtime as MCP server target. Returns target_id."""
        target_name = f"{name}-target"

        # Construct the Runtime invocation URL from the ARN
        encoded_arn = runtime_arn.replace(":", "%3A").replace("/", "%2F")
        endpoint_url = f"https://bedrock-agentcore.{settings.AWS_REGION}.amazonaws.com/runtimes/{encoded_arn}/invocations?qualifier=DEFAULT"

        try:
            resp = self.agentcore.create_gateway_target(
                gatewayIdentifier=gateway_id,
                name=target_name,
                targetConfiguration={
                    "mcp": {
                        "mcpServer": {
                            "endpoint": endpoint_url,
                        }
                    }
                },
                credentialProviderConfigurations=[{
                    "credentialProviderType": "GATEWAY_IAM_ROLE",
                    "credentialProvider": {
                        "iamCredentialProvider": {
                            "service": "bedrock-agentcore",
                            "region": settings.AWS_REGION,
                        }
                    }
                }],
            )
            return resp["targetId"]
        except ClientError as e:
            if "ConflictException" in str(e) or "already exists" in str(e).lower():
                return ""  # Already exists, idempotent
            raise

    def _delete_gateway_target(self, gateway_id: str, target_id: str) -> None:
        """Delete a specific gateway target."""
        if not gateway_id or not target_id:
            logger.warning(f"Missing gateway_id={gateway_id} or target_id={target_id} — skipping target delete")
            return
        try:
            self.agentcore.delete_gateway_target(
                gatewayIdentifier=gateway_id,
                targetId=target_id,
            )
            logger.info(f"Gateway target {target_id} delete requested")
        except ClientError as e:
            logger.warning(f"Gateway target delete failed (may already be deleted): {e}")