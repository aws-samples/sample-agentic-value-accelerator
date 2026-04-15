"""
Deploy script — Builds Docker image and pushes to ECR.

Called by deploy.sh after CloudFormation creates the ECR repository.
Uses only subprocess + aws CLI — no boto3 dependency.

Usage:
    python3 deploy.py --region us-east-1 --repo-name agent-safety-dashboard [--profile my-profile]
"""

import argparse
import subprocess
import sys


def run(cmd: str, check: bool = True, capture: bool = False) -> str:
    """Run a shell command, print it, return stdout."""
    print(f"  → {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and result.returncode != 0:
        print(f"  ✗ FAILED: {result.stderr.strip()}")
        sys.exit(1)
    out = result.stdout.strip()
    if out and not capture:
        print(f"    {out[:200]}")
    return out


def main():
    parser = argparse.ArgumentParser(description="Build and push dashboard Docker image to ECR")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--repo-name", default="agent-safety-dashboard")
    parser.add_argument("--profile", default=None)
    args = parser.parse_args()

    profile_flag = f"--profile {args.profile}" if args.profile else ""

    # Get account ID
    account_id = run(
        f"aws sts get-caller-identity {profile_flag} --query Account --output text",
        capture=True,
    )
    ecr_endpoint = f"{account_id}.dkr.ecr.{args.region}.amazonaws.com"
    image_uri = f"{ecr_endpoint}/{args.repo_name}:latest"

    print(f"\n📋 Account: {account_id} | Region: {args.region}")
    print(f"   Image URI: {image_uri}")

    # ECR login
    print(f"\n🔑 Logging into ECR...")
    run(f"aws ecr get-login-password --region {args.region} {profile_flag} | "
        f"docker login --username AWS --password-stdin {ecr_endpoint}")

    # Build
    print(f"\n🐳 Building Docker image (linux/amd64)...")
    run(f"docker build --platform linux/amd64 -t {args.repo_name}:latest .")

    # Tag
    print(f"\n🏷️  Tagging...")
    run(f"docker tag {args.repo_name}:latest {image_uri}")

    # Push
    print(f"\n📤 Pushing to ECR...")
    run(f"docker push {image_uri}")

    print(f"\n✅ Done: {image_uri}")


if __name__ == "__main__":
    main()
