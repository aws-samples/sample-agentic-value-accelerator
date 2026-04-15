#!/usr/bin/env python3
"""
Agent Deployment Script — Deploy AgentCore agents with safety controls.

Flow:
  1. Create Bedrock Inference Profile (tagged for cost tracking)
  2. Upload agent code to S3 (packaged with ARM64 dependencies)
  3. Deploy CloudFormation stack (IAM Role + DynamoDB + Memory + AgentCore Runtime)
  4. Verify the AgentCore Runtime reaches READY status

Usage:
    python deploy.py --name my_agent                    # Stateless agent
    python deploy.py --name my_agent --create-memory    # Memory-enabled agent
    python deploy.py --name my_agent --role-arn arn:aws:iam::123456789012:role/MyRole
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

SCRIPT_DIR = Path(__file__).parent
AGENTS_DIR = SCRIPT_DIR / "agents"
DEFAULT_MODEL = "us.anthropic.claude-sonnet-4-20250514-v1:0"


def get_account_id(session: boto3.Session) -> str:
    return session.client("sts").get_caller_identity()["Account"]


def get_or_create_s3_bucket(session: boto3.Session, region: str) -> str:
    """Get or create the S3 bucket for deployment artifacts."""
    account_id = get_account_id(session)
    bucket_name = f"agentcore-deploy-{account_id}-{region}"
    s3 = session.client("s3", region_name=region)
    try:
        s3.head_bucket(Bucket=bucket_name)
        print(f"  Using existing S3 bucket: {bucket_name}")
    except ClientError:
        print(f"  Creating S3 bucket: {bucket_name}")
        if region == "us-east-1":
            s3.create_bucket(Bucket=bucket_name)
        else:
            s3.create_bucket(
                Bucket=bucket_name,
                CreateBucketConfiguration={"LocationConstraint": region},
            )
    return bucket_name


def create_inference_profile(
    session: boto3.Session, agent_name: str, model_id: str, region: str
) -> str:
    """Create a Bedrock Inference Profile tagged for per-agent cost tracking."""
    bedrock = session.client("bedrock", region_name=region)
    profile_name = f"{agent_name}_profile"

    # Check if already exists
    try:
        existing = bedrock.list_inference_profiles(typeEquals="APPLICATION")
        for p in existing.get("inferenceProfileSummaries", []):
            if p["inferenceProfileName"] == profile_name:
                print(f"  Inference profile already exists: {p['inferenceProfileArn']}")
                return p["inferenceProfileArn"]
    except ClientError:
        pass

    # Find system profile ARN for the model
    profiles = bedrock.list_inference_profiles(typeEquals="SYSTEM_DEFINED")
    source_arn = None
    for p in profiles.get("inferenceProfileSummaries", []):
        if model_id in p.get("inferenceProfileArn", ""):
            source_arn = p["inferenceProfileArn"]
            break
    if not source_arn:
        source_arn = f"arn:aws:bedrock:{region}::foundation-model/{model_id}"

    resp = bedrock.create_inference_profile(
        inferenceProfileName=profile_name,
        modelSource={"copyFrom": source_arn},
        tags=[{"key": "agent-name", "value": agent_name}],
    )
    print(f"  Created inference profile: {resp['inferenceProfileArn']}")
    return resp["inferenceProfileArn"]


def package_and_upload(
    session: boto3.Session,
    agent_name: str,
    is_memory: bool,
    bucket: str,
    region: str,
) -> str:
    """Package agent code WITH dependencies and upload to S3. Returns S3 key."""
    s3 = session.client("s3", region_name=region)
    s3_key = f"{agent_name}/deployment.zip"

    tmp_dir = tempfile.mkdtemp()
    pkg_dir = os.path.join(tmp_dir, "package")
    os.makedirs(pkg_dir)

    try:
        # Copy agent files
        if is_memory:
            shutil.copy2(
                AGENTS_DIR / "memory_agent.py",
                os.path.join(pkg_dir, "agent_with_memory.py"),
            )
        else:
            shutil.copy2(
                AGENTS_DIR / "stateless_agent.py",
                os.path.join(pkg_dir, "agent.py"),
            )
            shutil.copy2(
                AGENTS_DIR / "session_reporter.py",
                os.path.join(pkg_dir, "session_reporter.py"),
            )
            shutil.copy2(
                AGENTS_DIR / "cloudwatch_metrics.py",
                os.path.join(pkg_dir, "cloudwatch_metrics.py"),
            )

        req_file = AGENTS_DIR / "requirements.txt"
        shutil.copy2(req_file, os.path.join(pkg_dir, "requirements.txt"))

        # Install dependencies for Linux ARM64 (AgentCore runtime platform)
        print("  Installing dependencies for Linux ARM64 (this may take a minute)...")
        _install_deps(str(req_file), pkg_dir)

        # Create zip
        zip_path = os.path.join(tmp_dir, "deployment.zip")
        shutil.make_archive(zip_path.replace(".zip", ""), "zip", pkg_dir)

        size_mb = os.path.getsize(zip_path) / 1024 / 1024
        print(f"  Package size: {size_mb:.1f} MB")

        # Upload
        s3.upload_file(zip_path, bucket, s3_key)
        print(f"  Uploaded to s3://{bucket}/{s3_key}")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    return s3_key


def _install_deps(req_file: str, target_dir: str) -> None:
    """Install Python dependencies for ARM64 Linux using uv."""
    platforms = [
        "aarch64-manylinux2014",
        "aarch64-manylinux_2_17",
        "aarch64-manylinux_2_28",
    ]
    try:
        for platform in platforms:
            try:
                subprocess.run(
                    [
                        "uv", "pip", "install",
                        "-r", req_file,
                        "--target", target_dir,
                        "--quiet",
                        "--python-platform", platform,
                        "--python-version", "3.11",
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                )
                print(f"  Dependencies installed with uv ({platform})")
                return
            except subprocess.CalledProcessError:
                continue
        print("  ❌ All ARM64 platform attempts failed.")
        sys.exit(1)
    except FileNotFoundError:
        print("  ❌ 'uv' is required for cross-platform packaging.")
        print("     Install it: curl -LsSf https://astral.sh/uv/install.sh | sh")
        sys.exit(1)


def check_session_table_exists(session: boto3.Session, table_name: str, region: str) -> bool:
    """Check if the DynamoDB session table already exists."""
    ddb = session.client("dynamodb", region_name=region)
    try:
        ddb.describe_table(TableName=table_name)
        return True
    except ddb.exceptions.ResourceNotFoundException:
        return False


def deploy_stack(
    session: boto3.Session,
    agent_name: str,
    region: str,
    s3_bucket: str,
    s3_key: str,
    role_arn: str = "",
    inference_profile_arn: str = "",
    is_memory: bool = False,
    existing_memory_id: str = "",
    session_table: str = "session-token-usage",
    create_session_table: bool = True,
) -> dict:
    """Deploy the CloudFormation stack. Returns stack outputs as a dict."""
    cf = session.client("cloudformation", region_name=region)
    template_path = SCRIPT_DIR / "template.yaml"

    with open(template_path) as f:
        template_body = f.read()

    stack_name = f"agent-{agent_name.replace('_', '-')}"
    entrypoint = "agent_with_memory.py" if is_memory else "agent.py"

    params = [
        {"ParameterKey": "AgentName", "ParameterValue": agent_name},
        {"ParameterKey": "S3Bucket", "ParameterValue": s3_bucket},
        {"ParameterKey": "S3Prefix", "ParameterValue": s3_key},
        {"ParameterKey": "RoleArn", "ParameterValue": role_arn},
        {"ParameterKey": "ModelId", "ParameterValue": inference_profile_arn},
        {"ParameterKey": "AgentTagName", "ParameterValue": agent_name},
        {"ParameterKey": "Entrypoint", "ParameterValue": entrypoint},
        {"ParameterKey": "EnableMemory", "ParameterValue": "yes" if is_memory else "no"},
        {"ParameterKey": "ExistingMemoryId", "ParameterValue": existing_memory_id},
        {"ParameterKey": "SessionTableName", "ParameterValue": session_table},
        {"ParameterKey": "CreateSessionTable", "ParameterValue": "yes" if create_session_table else "no"},
    ]

    print(f"\n  Deploying stack: {stack_name}")

    # Determine create vs update
    is_update = False
    try:
        resp = cf.describe_stacks(StackName=stack_name)
        stack_status = resp["Stacks"][0]["StackStatus"]
        # Stacks in terminal failure states can't be updated — treat as new
        if stack_status in (
            "ROLLBACK_COMPLETE", "DELETE_COMPLETE", "CREATE_FAILED",
            "DELETE_FAILED", "IMPORT_ROLLBACK_COMPLETE",
        ):
            if stack_status != "DELETE_COMPLETE":
                print(f"  Stack in {stack_status} state — deleting before re-create...")
                cf.delete_stack(StackName=stack_name)
                cf.get_waiter("stack_delete_complete").wait(
                    StackName=stack_name, WaiterConfig={"Delay": 10, "MaxAttempts": 30}
                )
            is_update = False
        else:
            is_update = True
    except ClientError:
        pass

    try:
        if is_update:
            print(f"  Stack exists — updating...")
            cf.update_stack(
                StackName=stack_name,
                TemplateBody=template_body,
                Parameters=params,
                Capabilities=["CAPABILITY_NAMED_IAM"],
            )
        else:
            print(f"  Creating new stack...")
            cf.create_stack(
                StackName=stack_name,
                TemplateBody=template_body,
                Parameters=params,
                Capabilities=["CAPABILITY_NAMED_IAM"],
                OnFailure="DELETE",
            )
    except ClientError as e:
        if "No updates are to be performed" in str(e):
            print("  No changes detected — stack is up to date.")
            outputs = cf.describe_stacks(StackName=stack_name)["Stacks"][0].get("Outputs", [])
            return {o["OutputKey"]: o["OutputValue"] for o in outputs}
        raise

    # Wait for completion
    waiter_name = "stack_update_complete" if is_update else "stack_create_complete"
    print(f"  Waiting for stack {stack_name} (this may take 2-5 minutes)...")
    try:
        waiter = cf.get_waiter(waiter_name)
        waiter.wait(StackName=stack_name, WaiterConfig={"Delay": 15, "MaxAttempts": 40})
    except Exception:
        _print_stack_errors(cf, stack_name)
        raise

    # Collect outputs
    stacks = cf.describe_stacks(StackName=stack_name)["Stacks"]
    outputs = {o["OutputKey"]: o["OutputValue"] for o in stacks[0].get("Outputs", [])}

    print(f"\n  ✅ Stack deployed successfully!")
    for k, v in outputs.items():
        print(f"    {k}: {v}")

    return outputs


def _print_stack_errors(cf, stack_name: str) -> None:
    """Print the most recent CF stack failure events for debugging."""
    try:
        events = cf.describe_stack_events(StackName=stack_name)["StackEvents"]
        print("\n  ❌ Stack deployment failed. Recent errors:")
        for ev in events[:10]:
            status = ev.get("ResourceStatus", "")
            if "FAILED" in status:
                print(f"    {ev['LogicalResourceId']}: {ev.get('ResourceStatusReason', 'unknown')}")
    except Exception:
        pass


def verify_runtime_status(
    session: boto3.Session, runtime_id: str, region: str, max_wait: int = 300
) -> str:
    """
    Poll the AgentCore Runtime until it reaches READY (or fails).

    CloudFormation may report CREATE_COMPLETE before the runtime is fully
    provisioned. This function polls the actual runtime status via the
    AgentCore control plane API.
    """
    client = session.client("bedrock-agentcore-control", region_name=region)
    print(f"\n  Verifying runtime status for: {runtime_id}")

    start = time.time()
    poll_interval = 10
    last_status = ""

    while time.time() - start < max_wait:
        try:
            resp = client.get_agent_runtime(agentRuntimeId=runtime_id)
            status = resp.get("status", "UNKNOWN")
            if status != last_status:
                print(f"    Status: {status}")
                last_status = status

            if status == "READY":
                print(f"  ✅ Runtime is READY and accepting invocations.")
                return status
            elif status in ("CREATE_FAILED", "UPDATE_FAILED"):
                reason = resp.get("failureReason", "unknown")
                print(f"  ❌ Runtime failed: {reason}")
                return status
            elif status in ("CREATING", "UPDATING"):
                time.sleep(poll_interval)
            else:
                # Unexpected status — keep polling briefly
                time.sleep(poll_interval)
        except ClientError as e:
            # bedrock-agentcore-control may not be available in all SDK versions
            print(f"  ⚠️  Could not verify runtime status: {e}")
            print(f"     Check the AgentCore console to confirm the runtime is READY.")
            return "UNKNOWN"

    print(f"  ⚠️  Timed out waiting for READY status (last: {last_status}).")
    print(f"     The runtime may still be provisioning. Check the AgentCore console.")
    return last_status


def main():
    parser = argparse.ArgumentParser(
        description="Deploy AgentCore agent with safety controls",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python deploy.py --name my_agent
  python deploy.py --name my_agent --create-memory
  python deploy.py --name my_agent --role-arn arn:aws:iam::123456789012:role/MyRole
  python deploy.py --name my_agent --existing-memory-id mem-abc123
        """,
    )
    parser.add_argument("--name", required=True, help="Agent name (alphanumeric + underscores)")
    parser.add_argument("--model-id", default=DEFAULT_MODEL, help="Bedrock model ID")
    parser.add_argument("--create-memory", action="store_true", help="Create new AgentCore Memory")
    parser.add_argument("--existing-memory-id", default="", help="Use existing Memory ID")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    parser.add_argument("--role-arn", default="", help="IAM execution role ARN (auto-created if empty)")
    parser.add_argument("--session-table", default="session-token-usage", help="DynamoDB table name")
    parser.add_argument("--profile", default=None, help="AWS CLI profile name")
    parser.add_argument("--skip-verify", action="store_true", help="Skip post-deploy runtime verification")
    args = parser.parse_args()

    name = args.name.replace("-", "_")
    is_memory = args.create_memory or bool(args.existing_memory_id)
    session = boto3.Session(profile_name=args.profile, region_name=args.region)

    print(f"\n{'='*60}")
    print(f"  Agent:    {name}")
    print(f"  Type:     {'Memory-enabled' if is_memory else 'Stateless (DynamoDB sessions)'}")
    print(f"  Model:    {args.model_id}")
    print(f"  Region:   {args.region}")
    print(f"{'='*60}\n")

    # Step 1: Inference Profile
    print("Step 1: Creating Bedrock Inference Profile...")
    inference_arn = create_inference_profile(session, name, args.model_id, args.region)

    # Step 2: S3 + Upload
    print("\nStep 2: Packaging and uploading agent code...")
    bucket = get_or_create_s3_bucket(session, args.region)
    s3_key = package_and_upload(session, name, is_memory, bucket, args.region)

    # Step 3: Check if session table already exists
    table_exists = check_session_table_exists(session, args.session_table, args.region)
    if table_exists:
        print(f"\nStep 3: DynamoDB table '{args.session_table}' already exists — skipping creation.")
    else:
        print(f"\nStep 3: DynamoDB table '{args.session_table}' will be created by CloudFormation.")

    # Step 4: Deploy CF
    print("\nStep 4: Deploying CloudFormation stack...")
    outputs = deploy_stack(
        session=session,
        agent_name=name,
        region=args.region,
        s3_bucket=bucket,
        s3_key=s3_key,
        role_arn=args.role_arn or "",
        inference_profile_arn=inference_arn,
        is_memory=is_memory,
        existing_memory_id=args.existing_memory_id,
        session_table=args.session_table,
        create_session_table=not table_exists,
    )

    # Step 5: Verify runtime is actually READY
    runtime_id = outputs.get("AgentRuntimeId", "")
    runtime_arn = outputs.get("AgentRuntimeArn", "")
    inference_profile = outputs.get("InferenceProfileArn", inference_arn)
    if runtime_id and not args.skip_verify:
        print("\nStep 5: Verifying AgentCore Runtime status...")
        status = verify_runtime_status(session, runtime_id, args.region)
        if status == "READY":
            print(f"\n✅ Agent '{name}' deployed and READY!")
            print(f"\n  Runtime ARN:          {runtime_arn}")
            print(f"  Inference Profile:    {inference_profile}")
            if is_memory:
                mem_id = outputs.get("MemoryId", args.existing_memory_id or "N/A")
                print(f"  Memory ID:            {mem_id}")
            print(f"\nTo invoke:")
            print(f"  python invoke_agent.py --arn {runtime_arn} --prompt 'Hello!'")
        else:
            print(f"\n⚠️  Agent '{name}' deployed but runtime status is: {status}")
            print(f"   Check the AgentCore console for details.")
    else:
        print(f"\n✅ Agent '{name}' stack deployed!")
        print(f"\n  Runtime ARN:          {runtime_arn}")
        print(f"  Inference Profile:    {inference_profile}")
        print(f"\nTo invoke:")
        print(f"  python invoke_agent.py --arn {runtime_arn} --prompt 'Hello!'")


if __name__ == "__main__":
    main()
