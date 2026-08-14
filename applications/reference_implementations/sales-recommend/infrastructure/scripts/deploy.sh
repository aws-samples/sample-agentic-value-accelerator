#!/bin/bash
set -euo pipefail

########################################################################
# Sales Recommend — Deploy (delegator)
#
# The canonical, self-contained deploy entrypoint is the ROOT deploy.sh
# (../../deploy.sh) — the exact same script the AVA Control Plane runs. It:
#   - ensures/creates the Terraform state backend
#   - deploys base infra, then packages the agent as an AgentCore *code*
#     deploy (self-contained S3 zip — the agent is NOT a container, so there
#     is no agent ECR repo), builds/pushes the UI image, and applies the
#     full stack (self-provisioned Knowledge Base + wiki generator + ECS +
#     CloudFront).
#
# This wrapper exists only because earlier docs referenced
# infrastructure/scripts/deploy.sh. It forwards to the canonical script so the
# two can never drift. For a zero-input local deploy with logging, use
# ./deploy-local.sh instead.
########################################################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$INFRA_DIR")"

exec "$ROOT_DIR/deploy.sh"
