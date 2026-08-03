#!/usr/bin/env python3
"""
Deploy the AgentCore Runtime and output the ARN.

Called by the buildspec BEFORE terraform apply. Uses the bedrock-agentcore
SDK to create or update the runtime, then prints the ARN for the pipeline
to capture and inject as TF_VAR_agent_runtime_arn.

Usage:
    python deploy_runtime.py --name sales-recommend-abc123 \
        --image-uri 123456.dkr.ecr.us-east-1.amazonaws.com/sales-recommend-agent:latest \
        --role-arn arn:aws:iam::123456:role/sales-recommend-agentcore-execution-role \
        --region us-east-1

Output (last line):
    AGENT_RUNTIME_ARN=arn:aws:bedrock:us-east-1:123456:agent-runtime/xyz
"""

import argparse
import json
import sys
import time

import boto3


def get_or_create_runtime(name: str, image_uri: str, role_arn: str, region: str) -> str:
    """Create or update an AgentCore runtime. Returns the ARN."""
    client = boto3.client("bedrock-agent-runtime", region_name=region)

    # Try to get existing runtime
    try:
        response = client.get_agent_runtime(agentRuntimeName=name)
        arn = response["agentRuntimeArn"]
        print(f"Runtime already exists: {arn}", file=sys.stderr)
        # Update with latest image
        try:
            client.update_agent_runtime(
                agentRuntimeName=name,
                agentRuntimeArtifact={
                    "containerConfiguration": {"containerUri": image_uri}
                },
                roleArn=role_arn,
            )
            print("Runtime updated with latest image.", file=sys.stderr)
        except Exception as e:
            print(f"Warning: could not update runtime: {e}", file=sys.stderr)
        return arn
    except client.exceptions.ResourceNotFoundException:
        pass
    except Exception as e:
        # API might not support get_agent_runtime — try create
        print(f"Note: get_agent_runtime failed ({e}), attempting create...", file=sys.stderr)

    # Create new runtime
    print(f"Creating AgentCore runtime: {name}", file=sys.stderr)
    try:
        response = client.create_agent_runtime(
            agentRuntimeName=name,
            agentRuntimeArtifact={
                "containerConfiguration": {"containerUri": image_uri}
            },
            roleArn=role_arn,
            description="AWS Solutions Advisor agent (Strands on AgentCore)",
        )
        arn = response["agentRuntimeArn"]
        print(f"Runtime created: {arn}", file=sys.stderr)

        # Wait for it to be active
        for i in range(30):
            time.sleep(10)
            status_resp = client.get_agent_runtime(agentRuntimeName=name)
            status = status_resp.get("status", "UNKNOWN")
            print(f"  Status: {status}", file=sys.stderr)
            if status in ("ACTIVE", "READY"):
                break
        return arn
    except Exception as e:
        print(f"ERROR creating runtime: {e}", file=sys.stderr)
        # Fallback: try using bedrock-agentcore SDK directly
        return fallback_deploy(name, image_uri, role_arn, region)


def fallback_deploy(name: str, image_uri: str, role_arn: str, region: str) -> str:
    """Fallback using the bedrock_agentcore package's deployment mechanism."""
    try:
        from bedrock_agentcore.runtime import AgentRuntime
        runtime = AgentRuntime(
            name=name,
            image_uri=image_uri,
            role_arn=role_arn,
            region=region,
        )
        runtime.deploy()
        return runtime.arn
    except ImportError:
        print("bedrock_agentcore package not available for fallback.", file=sys.stderr)
        raise
    except Exception as e:
        print(f"Fallback deploy also failed: {e}", file=sys.stderr)
        raise


def main():
    parser = argparse.ArgumentParser(description="Deploy AgentCore Runtime")
    parser.add_argument("--name", required=True, help="Runtime name")
    parser.add_argument("--image-uri", required=True, help="ECR image URI")
    parser.add_argument("--role-arn", required=True, help="Execution role ARN")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    args = parser.parse_args()

    arn = get_or_create_runtime(args.name, args.image_uri, args.role_arn, args.region)

    # Print the ARN as the LAST line — buildspec captures this
    print(f"AGENT_RUNTIME_ARN={arn}")


if __name__ == "__main__":
    main()
