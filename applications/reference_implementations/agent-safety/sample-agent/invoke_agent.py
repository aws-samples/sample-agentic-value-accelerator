#!/usr/bin/env python3
"""
Invoke a deployed AgentCore Runtime agent.

Usage:
    python invoke_agent.py --arn <AGENT_ARN> --prompt "Hello!"
    python invoke_agent.py --arn <AGENT_ARN> --prompt "Tell me about loans" --session-id my-session-001
"""

import argparse
import json
import uuid

import boto3


def invoke(agent_arn: str, prompt: str, session_id: str | None = None, region: str = "us-east-1", profile: str | None = None):
    session = boto3.Session(profile_name=profile, region_name=region)
    client = session.client("bedrock-agentcore")

    sid = session_id or f"session-{uuid.uuid4()}"
    if len(sid) < 33:
        sid = sid + "-" + "0" * (33 - len(sid) - 1)

    payload = json.dumps({"prompt": prompt}).encode()

    print(f"Invoking agent: {agent_arn}")
    print(f"Session ID:     {sid}")
    print(f"Prompt:         {prompt}")
    print("-" * 60)

    response = client.invoke_agent_runtime(
        agentRuntimeArn=agent_arn,
        runtimeSessionId=sid,
        payload=payload,
        qualifier="DEFAULT",
    )

    content = []
    for chunk in response.get("response", []):
        content.append(chunk.decode("utf-8"))

    result = json.loads("".join(content))
    print(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Invoke AgentCore Runtime agent")
    parser.add_argument("--arn", required=True, help="Agent runtime ARN")
    parser.add_argument("--prompt", default="Hello!", help="Prompt to send")
    parser.add_argument("--session-id", default=None, help="Session ID (reuse for multi-turn)")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--profile", default=None, help="AWS CLI profile name")
    args = parser.parse_args()
    invoke(args.arn, args.prompt, args.session_id, args.region, args.profile)
