#!/usr/bin/env python3
"""Invoke the Govern Compliance Agent via AgentCore SDK.

This script demonstrates how to invoke the compliance agent once deployed
to AgentCore. It can also be used to test existing AgentCore runtimes.

Usage:
    # Invoke a deployed compliance agent
    python invoke_agentcore.py --runtime-arn <arn> --scope all

    # List available runtimes
    python invoke_agentcore.py --list-runtimes

    # Quick audit (uses first matching runtime)
    python invoke_agentcore.py --quick-audit
"""

import argparse
import json
import sys
import time

import boto3
from botocore.config import Config


def list_runtimes(region: str = "us-east-1"):
    """List all AgentCore runtimes."""
    client = boto3.client("bedrock-agentcore-control", region_name=region)

    print(f"\nAgentCore Runtimes in {region}:")
    print("-" * 60)

    try:
        response = client.list_agent_runtimes(maxResults=100)
        runtimes = response.get("agentRuntimes", [])

        if not runtimes:
            print("No AgentCore runtimes found.")
            return []

        for rt in runtimes:
            print(f"  Name: {rt.get('agentRuntimeName', 'unknown')}")
            print(f"  ID:   {rt.get('agentRuntimeId', 'unknown')}")
            print(f"  Status: {rt.get('status', 'unknown')}")
            if rt.get("agentRuntimeArn"):
                print(f"  ARN:  {rt.get('agentRuntimeArn')}")
            print()

        return runtimes

    except Exception as e:
        print(f"Error listing runtimes: {e}")
        return []


def find_compliance_runtime(region: str = "us-east-1") -> str | None:
    """Find a compliance-related runtime."""
    client = boto3.client("bedrock-agentcore-control", region_name=region)

    try:
        response = client.list_agent_runtimes(maxResults=100)
        runtimes = response.get("agentRuntimes", [])

        # Look for compliance-related runtimes
        compliance_keywords = ["compliance", "govern", "audit", "security"]

        for rt in runtimes:
            name = rt.get("agentRuntimeName", "").lower()
            if any(kw in name for kw in compliance_keywords):
                return rt.get("agentRuntimeArn") or rt.get("agentRuntimeId")

        # Fall back to first ready runtime for testing
        for rt in runtimes:
            if rt.get("status") == "READY":
                print(f"Note: No compliance runtime found, using '{rt.get('agentRuntimeName')}' for testing")
                return rt.get("agentRuntimeArn") or rt.get("agentRuntimeId")

        return None

    except Exception as e:
        print(f"Error finding runtime: {e}")
        return None


def invoke_runtime(
    runtime_arn: str,
    payload: dict,
    region: str = "us-east-1",
    timeout: int = 600,
) -> dict:
    """Invoke an AgentCore runtime and return the response."""

    config = Config(
        read_timeout=timeout,
        connect_timeout=30,
    )
    client = boto3.client("bedrock-agentcore", region_name=region, config=config)

    payload_bytes = json.dumps(payload).encode("utf-8")

    print(f"\nInvoking runtime: {runtime_arn}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    print("-" * 60)

    start_time = time.time()

    try:
        response = client.invoke_agent_runtime(
            agentRuntimeArn=runtime_arn,
            payload=payload_bytes,
        )

        # Extract response body
        result_text = ""
        for key in ("response", "body", "output"):
            if key in response:
                val = response[key]
                if hasattr(val, "read"):
                    result_text = val.read().decode("utf-8")
                    break
                elif isinstance(val, bytes):
                    result_text = val.decode("utf-8")
                    break
                elif isinstance(val, str):
                    result_text = val
                    break

        duration_ms = int((time.time() - start_time) * 1000)

        print(f"\nCompleted in {duration_ms}ms")
        print("-" * 60)

        # Try to parse as JSON
        try:
            result = json.loads(result_text)
            print(json.dumps(result, indent=2))
            return {"success": True, "response": result, "duration_ms": duration_ms}
        except json.JSONDecodeError:
            print(result_text)
            return {"success": True, "response": result_text, "duration_ms": duration_ms}

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        print(f"\nError: {e}")
        return {"success": False, "error": str(e), "duration_ms": duration_ms}


def run_compliance_audit(
    runtime_arn: str,
    scope: str = "all",
    include_remediation: bool = True,
    auto_remediate: bool = False,
    region: str = "us-east-1",
) -> dict:
    """Run a compliance audit via AgentCore.

    This is the payload format the govern_compliance_agent orchestrator expects.
    """
    payload = {
        "scope": scope,
        "include_remediation": include_remediation,
        "auto_remediate": auto_remediate,
        "dry_run": not auto_remediate,  # Always dry_run unless explicitly remediating
    }

    return invoke_runtime(runtime_arn, payload, region=region)


def main():
    parser = argparse.ArgumentParser(description="Invoke Govern Compliance Agent via AgentCore")
    parser.add_argument("--runtime-arn", help="AgentCore runtime ARN to invoke")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    parser.add_argument("--list-runtimes", action="store_true", help="List available runtimes")
    parser.add_argument("--quick-audit", action="store_true", help="Run a quick audit using auto-detected runtime")

    # Audit options
    parser.add_argument("--scope", default="all", choices=["all", "agents", "security", "drift", "privacy"],
                        help="Audit scope")
    parser.add_argument("--no-remediation", action="store_true", help="Skip remediation planning")
    parser.add_argument("--auto-remediate", action="store_true",
                        help="Auto-execute safe remediations (USE WITH CAUTION)")
    parser.add_argument("--timeout", type=int, default=600, help="Request timeout in seconds")

    # Raw invocation
    parser.add_argument("--payload", help="Raw JSON payload for custom invocation")

    args = parser.parse_args()

    if args.list_runtimes:
        list_runtimes(args.region)
        return

    # Determine runtime ARN
    runtime_arn = args.runtime_arn
    if not runtime_arn:
        if args.quick_audit:
            runtime_arn = find_compliance_runtime(args.region)
            if not runtime_arn:
                print("Error: No suitable runtime found. Deploy the compliance agent first or specify --runtime-arn")
                sys.exit(1)
        else:
            print("Error: --runtime-arn is required (or use --quick-audit or --list-runtimes)")
            sys.exit(1)

    # Build and send request
    if args.payload:
        payload = json.loads(args.payload)
        result = invoke_runtime(runtime_arn, payload, region=args.region, timeout=args.timeout)
    else:
        result = run_compliance_audit(
            runtime_arn=runtime_arn,
            scope=args.scope,
            include_remediation=not args.no_remediation,
            auto_remediate=args.auto_remediate,
            region=args.region,
        )

    # Exit code based on success
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
