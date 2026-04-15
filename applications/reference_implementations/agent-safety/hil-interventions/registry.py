"""
Agent Registry — CRUD operations for the central agent-registry DynamoDB table.

Every agent in the system is registered here with its config, thresholds, and status.
Other components read from this table to know agent details.

Usage:
    # Register a new agent
    python registry.py register \
        --name loan-processor \
        --arn arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/loan-processor \
        --role AgentCore-loan-processor-role \
        --team lending \
        --max-tokens 200000 \
        --max-invocations 80

    # List all agents
    python registry.py list

    # List agents by team
    python registry.py list --team lending

    # Get one agent
    python registry.py get --name loan-processor

    # Update status
    python registry.py update-status --name loan-processor --status suspended

    # Deregister
    python registry.py deregister --name loan-processor
"""

import argparse
import json
import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError


TABLE_NAME = os.environ.get("REGISTRY_TABLE", "agent-registry")


class AgentRegistry:
    """CRUD operations for the agent registry."""

    def __init__(self, region: str = "us-east-1"):
        self.table = boto3.resource("dynamodb", region_name=region).Table(TABLE_NAME)

    def register(
        self,
        agent_name: str,
        agent_runtime_arn: str,
        iam_role_name: str,
        team: str = "default",
        environment: str = "production",
        max_session_tokens: int = 100_000,
        max_input_tokens: int = 70_000,
        max_output_tokens: int = 30_000,
        max_tool_invocations: int = 50,
        monthly_budget_usd: float = 0.0,
        inference_profile_arn: str | None = None,
        gateway_arn: str | None = None,
        memory_id: str | None = None,
        tools: list[str] | None = None,
        tags: dict[str, str] | None = None,
    ) -> dict:
        """Register a new agent in the registry."""
        now = datetime.now(timezone.utc).isoformat()

        item = {
            "agent_name": agent_name,
            "agent_runtime_arn": agent_runtime_arn,
            "iam_role_name": iam_role_name,
            "team": team,
            "environment": environment,
            "status": "active",
            # Thresholds
            "max_session_tokens": max_session_tokens,
            "max_input_tokens": max_input_tokens,
            "max_output_tokens": max_output_tokens,
            "max_tool_invocations": max_tool_invocations,
            "monthly_budget_usd": str(monthly_budget_usd),
            # Optional AgentCore resources
            "inference_profile_arn": inference_profile_arn or "",
            "gateway_arn": gateway_arn or "",
            "memory_id": memory_id or "",
            "tools": tools or [],
            "tags": tags or {},
            # Metadata
            "created_at": now,
            "updated_at": now,
        }

        self.table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(agent_name)",
        )
        return item

    def get(self, agent_name: str) -> dict | None:
        """Get a single agent by name."""
        response = self.table.get_item(Key={"agent_name": agent_name})
        return response.get("Item")

    def list_all(self) -> list[dict]:
        """List all registered agents."""
        response = self.table.scan()
        return response.get("Items", [])

    def list_by_team(self, team: str) -> list[dict]:
        """List agents filtered by team."""
        response = self.table.query(
            IndexName="team-index",
            KeyConditionExpression=boto3.dynamodb.conditions.Key("team").eq(team),
        )
        return response.get("Items", [])

    def list_by_status(self, status: str) -> list[dict]:
        """List agents filtered by status (active/suspended/stopped)."""
        response = self.table.query(
            IndexName="status-index",
            KeyConditionExpression=boto3.dynamodb.conditions.Key("status").eq(status),
        )
        return response.get("Items", [])

    def update_status(self, agent_name: str, status: str) -> dict:
        """Update agent status (active/suspended/stopped)."""
        now = datetime.now(timezone.utc).isoformat()
        response = self.table.update_item(
            Key={"agent_name": agent_name},
            UpdateExpression="SET #s = :status, updated_at = :now",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":status": status, ":now": now},
            ReturnValues="ALL_NEW",
        )
        return response["Attributes"]

    def update_thresholds(
        self,
        agent_name: str,
        max_session_tokens: int | None = None,
        max_tool_invocations: int | None = None,
    ) -> dict:
        """Update agent thresholds."""
        now = datetime.now(timezone.utc).isoformat()
        updates = ["updated_at = :now"]
        values: dict = {":now": now}

        if max_session_tokens is not None:
            updates.append("max_session_tokens = :mst")
            values[":mst"] = max_session_tokens
        if max_tool_invocations is not None:
            updates.append("max_tool_invocations = :mti")
            values[":mti"] = max_tool_invocations

        response = self.table.update_item(
            Key={"agent_name": agent_name},
            UpdateExpression="SET " + ", ".join(updates),
            ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW",
        )
        return response["Attributes"]

    def deregister(self, agent_name: str) -> None:
        """Remove an agent from the registry."""
        self.table.delete_item(Key={"agent_name": agent_name})


def _print_agents(agents: list[dict]) -> None:
    """Pretty-print agent list."""
    if not agents:
        print("No agents found.")
        return
    for a in agents:
        print(f"  {a['agent_name']:30s} | {a.get('status','?'):10s} | {a.get('team','?'):15s} | tokens: {a.get('max_session_tokens','?')}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Agent Registry CLI")
    sub = parser.add_subparsers(dest="command")

    # register
    reg = sub.add_parser("register", help="Register a new agent")
    reg.add_argument("--name", required=True)
    reg.add_argument("--arn", required=True, help="AgentCore Runtime ARN")
    reg.add_argument("--role", required=True, help="IAM execution role name")
    reg.add_argument("--team", default="default")
    reg.add_argument("--env", default="production")
    reg.add_argument("--max-tokens", type=int, default=100_000)
    reg.add_argument("--max-invocations", type=int, default=50)
    reg.add_argument("--monthly-budget", type=float, default=0.0, help="Monthly cost budget in USD")
    reg.add_argument("--gateway-arn", default=None)
    reg.add_argument("--memory-id", default=None)
    reg.add_argument("--tools", nargs="*", default=None)
    reg.add_argument("--region", default="us-east-1")

    # list
    ls = sub.add_parser("list", help="List agents")
    ls.add_argument("--team", default=None)
    ls.add_argument("--status", default=None)
    ls.add_argument("--region", default="us-east-1")

    # get
    gt = sub.add_parser("get", help="Get agent details")
    gt.add_argument("--name", required=True)
    gt.add_argument("--region", default="us-east-1")

    # update-status
    us = sub.add_parser("update-status", help="Update agent status")
    us.add_argument("--name", required=True)
    us.add_argument("--status", required=True, choices=["active", "suspended", "stopped"])
    us.add_argument("--region", default="us-east-1")

    # deregister
    dr = sub.add_parser("deregister", help="Remove agent from registry")
    dr.add_argument("--name", required=True)
    dr.add_argument("--region", default="us-east-1")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return

    registry = AgentRegistry(region=args.region)

    if args.command == "register":
        try:
            item = registry.register(
                agent_name=args.name,
                agent_runtime_arn=args.arn,
                iam_role_name=args.role,
                team=args.team,
                environment=args.env,
                max_session_tokens=args.max_tokens,
                max_tool_invocations=args.max_invocations,
                monthly_budget_usd=args.monthly_budget,
                gateway_arn=args.gateway_arn,
                memory_id=args.memory_id,
                tools=args.tools,
            )
            print(f"[OK] Registered: {args.name}")
        except ClientError as e:
            if "ConditionalCheckFailedException" in str(e):
                print(f"[ERROR] Agent '{args.name}' already exists.")
            else:
                raise

    elif args.command == "list":
        if args.team:
            agents = registry.list_by_team(args.team)
        elif args.status:
            agents = registry.list_by_status(args.status)
        else:
            agents = registry.list_all()
        _print_agents(agents)

    elif args.command == "get":
        agent = registry.get(args.name)
        if agent:
            print(json.dumps(agent, indent=2, default=str))
        else:
            print(f"Agent '{args.name}' not found.")

    elif args.command == "update-status":
        result = registry.update_status(args.name, args.status)
        print(f"[OK] {args.name} → {args.status}")

    elif args.command == "deregister":
        registry.deregister(args.name)
        print(f"[OK] Deregistered: {args.name}")


if __name__ == "__main__":
    main()
