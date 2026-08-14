"""
Deploy script — Builds Docker image and pushes to ECR.

Called by deploy.sh after CloudFormation creates the ECR repository.
Uses only subprocess + aws CLI — no boto3 dependency.

Supports docker, finch, nerdctl, or podman as container runtime.

Usage:
    python3 deploy.py --region us-east-1 --repo-name agent-safety-dashboard [--profile my-profile]
"""

import argparse
import platform
import shutil
import subprocess
import sys


def detect_container_runtime() -> str:
    """Detect available container runtime, preferring docker > finch > nerdctl > podman."""
    for runtime in ("docker", "finch", "nerdctl", "podman"):
        if shutil.which(runtime):
            return runtime
    print("❌ No container runtime found. Install one of: docker, finch, nerdctl, podman")
    sys.exit(1)


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
    parser.add_argument("--image-tag", default="latest",
                        help="Image tag to build/push (use a unique tag per build so ECS rolls out)")
    args = parser.parse_args()

    profile_flag = f"--profile {args.profile}" if args.profile else ""
    runtime = detect_container_runtime()
    print(f"\n🐳 Using container runtime: {runtime}")

    # Get account ID
    account_id = run(
        f"aws sts get-caller-identity {profile_flag} --query Account --output text",
        capture=True,
    )
    ecr_endpoint = f"{account_id}.dkr.ecr.{args.region}.amazonaws.com"
    image_uri = f"{ecr_endpoint}/{args.repo_name}:{args.image_tag}"

    print(f"\n📋 Account: {account_id} | Region: {args.region}")
    print(f"   Image URI: {image_uri}")

    # ECR login
    print(f"\n🔑 Logging into ECR...")
    run(f"aws ecr get-login-password --region {args.region} {profile_flag} | "
        f"{runtime} login --username AWS --password-stdin {ecr_endpoint}")

    # ECS Express Mode runs its tasks on X86_64 (Express Mode's default; the inline
    # PrimaryContainer path in template.yaml can't select ARM64), so the dashboard image
    # must be linux/amd64. When this build runs on a non-amd64 host — e.g. an ARM64
    # CodeBuild runner in the AVA pipeline — register QEMU emulators first, otherwise the
    # amd64 RUN steps (pip install) fail with "exec format error".
    host_machine = platform.machine().lower()
    if host_machine not in ("x86_64", "amd64"):
        print(f"\n🔧 Non-amd64 host detected ({host_machine}); registering QEMU emulators for cross-arch build...")
        run(f"{runtime} run --privileged --rm tonistiigi/binfmt --install amd64", check=False)

    # Build (linux/amd64 for ECS Fargate / Express Mode)
    print(f"\n🐳 Building Docker image (linux/amd64)...")
    run(f"{runtime} build --platform linux/amd64 -t {args.repo_name}:{args.image_tag} .")

    # Tag
    print(f"\n🏷️  Tagging...")
    run(f"{runtime} tag {args.repo_name}:{args.image_tag} {image_uri}")

    # Push
    print(f"\n📤 Pushing to ECR...")
    run(f"{runtime} push {image_uri}")

    print(f"\n✅ Done: {image_uri}")


if __name__ == "__main__":
    main()
