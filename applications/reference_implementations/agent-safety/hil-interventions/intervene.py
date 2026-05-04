"""
Intervention CLI — Manually trigger safety actions from the command line.

Usage:
    # Stop a session (reason is required)
    python intervene.py stop-session \
        --agent-name loan-processor \
        --session-id sess-abc123 \
        --reason "Observed loop behavior during monitoring"

    # Stop by ARN directly
    python intervene.py stop-session \
        --agent-arn arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/loan-processor \
        --session-id sess-abc123 \
        --reason "Token budget exceeded"

    # List recent interventions
    python intervene.py list --agent-name loan-processor

    # List all interventions
    python intervene.py list
"""

import argparse
import json
import os
from datetime import datetime, timezone

import boto3

from registry import AgentRegistry
from stop_session import stop_session, _log_intervention


INTERVENTION_TABLE = os.environ.get("INTERVENTION_TABLE", "intervention-log")


def cmd_stop_session(args) -> None:
    """Stop a session with required reason."""
    registry = AgentRegistry(region=args.region)

    # Resolve ARN from name if needed
    agent_arn = args.agent_arn
    if not agent_arn and args.agent_name:
        agent = registry.get(args.agent_name)
        if not agent:
            print(f"[ERROR] Agent '{args.agent_name}' not found in registry.")
            return
        agent_arn = agent["agent_runtime_arn"]

    if not agent_arn:
        print("[ERROR] Provide --agent-name or --agent-arn")
        return

    if not args.reason:
        print("[ERROR] --reason is required for all interventions.")
        return

    print(f"Stopping session: {args.session_id}")
    print(f"  Agent: {agent_arn}")
    print(f"  Reason: {args.reason}")

    result = stop_session(
        agent_runtime_arn=agent_arn,
        session_id=args.session_id,
        reason=args.reason,
        triggered_by="human",
        admin_user=args.admin_user,
    )

    print(f"  Result: {result['status']}")
    if "intervention_id" in result:
        print(f"  Intervention ID: {result['intervention_id']}")


def cmd_list_interventions(args) -> None:
    """List recent interventions."""
    table = boto3.resource("dynamodb", region_name=args.region).Table(INTERVENTION_TABLE)

    if args.agent_name:
        response = table.query(
            IndexName="agent-index",
            KeyConditionExpression=boto3.dynamodb.conditions.Key("agent_name").eq(args.agent_name),
            ScanIndexForward=False,
            Limit=args.limit,
        )
    else:
        response = table.scan(Limit=args.limit)

    items = response.get("Items", [])
    if not items:
        print("No interventions found.")
        return

    for item in items:
        print(
            f"  {item['timestamp']}  |  {item['action']:15s}  |  "
            f"{item.get('agent_name','?'):20s}  |  {item['triggered_by']:6s}  |  "
            f"{item.get('reason','')[:60]}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Agent Safety Intervention CLI")
    parser.add_argument("--region", default="us-east-1")
    sub = parser.add_subparsers(dest="command")

    # stop-session
    stop = sub.add_parser("stop-session", help="Stop an agent session")
    stop.add_argument("--agent-name", default=None, help="Agent name (looked up in registry)")
    stop.add_argument("--agent-arn", default=None, help="Agent runtime ARN (direct)")
    stop.add_argument("--session-id", required=True)
    stop.add_argument("--reason", required=True, help="Why are you stopping this session?")
    stop.add_argument("--admin-user", default="cli-user", help="Your username")

    # list
    ls = sub.add_parser("list", help="List recent interventions")
    ls.add_argument("--agent-name", default=None)
    ls.add_argument("--limit", type=int, default=20)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return

    if args.command == "stop-session":
        cmd_stop_session(args)
    elif args.command == "list":
        cmd_list_interventions(args)


if __name__ == "__main__":
    main()
