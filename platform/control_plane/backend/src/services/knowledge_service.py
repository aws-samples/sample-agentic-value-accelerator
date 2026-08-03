"""Knowledge service — DynamoDB CRUD for knowledge registrations."""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import boto3

from models.knowledge import KnowledgeRegistration, KnowledgeRegistrationCreate

logger = logging.getLogger(__name__)


class KnowledgeService:
    def __init__(self, table_name: str, region: str = "us-east-1"):
        self.dynamodb = boto3.resource("dynamodb", region_name=region)
        self.table = self.dynamodb.Table(table_name)

    def _to_item(self, reg: KnowledgeRegistration) -> dict:
        return {
            "pk": f"KNOWLEDGE#{reg.registration_id}",
            "sk": "META",
            **reg.dict(),
        }

    def _from_item(self, item: dict) -> KnowledgeRegistration:
        item.pop("pk", None)
        item.pop("sk", None)
        return KnowledgeRegistration(**item)

    def create(self, req: KnowledgeRegistrationCreate) -> KnowledgeRegistration:
        now = datetime.now(timezone.utc).isoformat()

        # Set tools and MCP server based on type
        if req.type == "knowledge_base":
            tools = ["retrieve", "retrieve_and_generate", "get_status", "sync"]
            mcp_server = "ava-kb-mcp-server"
        else:
            tools = ["manage_aws_glue_databases", "manage_aws_glue_tables", "manage_aws_athena_query_executions", "manage_aws_athena_databases_and_tables"]
            mcp_server = "ava-datalake-mcp-server"

        reg = KnowledgeRegistration(
            registration_id=str(uuid.uuid4()),
            name=req.name,
            type=req.type,
            description=req.description,
            status="PROVISIONING",
            config=req.config,
            tools=tools,
            mcp_server=mcp_server,
            created_at=now,
            updated_at=now,
        )
        self.table.put_item(Item=self._to_item(reg))
        logger.info(f"Created knowledge registration: {reg.registration_id}")
        return reg

    def get(self, registration_id: str) -> Optional[KnowledgeRegistration]:
        resp = self.table.get_item(Key={"pk": f"KNOWLEDGE#{registration_id}", "sk": "META"})
        item = resp.get("Item")
        if not item:
            return None
        return self._from_item(item)

    def list_all(self) -> list[KnowledgeRegistration]:
        resp = self.table.scan(
            FilterExpression="begins_with(pk, :prefix)",
            ExpressionAttributeValues={":prefix": "KNOWLEDGE#"},
        )
        return [self._from_item(item) for item in resp.get("Items", [])]

    def update_status(self, registration_id: str, status: str, **kwargs) -> None:
        update_expr = "SET #status = :status, updated_at = :now"
        expr_values = {
            ":status": status,
            ":now": datetime.now(timezone.utc).isoformat(),
        }
        expr_names = {"#status": "status"}

        for key, value in kwargs.items():
            update_expr += f", {key} = :{key}"
            expr_values[f":{key}"] = value

        self.table.update_item(
            Key={"pk": f"KNOWLEDGE#{registration_id}", "sk": "META"},
            UpdateExpression=update_expr,
            ExpressionAttributeValues=expr_values,
            ExpressionAttributeNames=expr_names,
        )
        logger.info(f"Updated knowledge {registration_id}: status={status}")

    def delete(self, registration_id: str) -> None:
        self.table.delete_item(Key={"pk": f"KNOWLEDGE#{registration_id}", "sk": "META"})
        logger.info(f"Deleted knowledge registration: {registration_id}")
