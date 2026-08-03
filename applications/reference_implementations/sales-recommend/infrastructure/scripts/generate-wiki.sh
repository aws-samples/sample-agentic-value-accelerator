#!/bin/bash
set -euo pipefail

########################################################################
# generate-wiki.sh — package the wiki-agent, upload it, and kick off a
# CodeBuild run that turns a repo URL into a KB capability profile.
#
# Usage:
#   ./generate-wiki.sh <REPO_URL> [REPO_BRANCH]
#
# Example:
#   ./generate-wiki.sh https://github.com/aws-samples/serverless-rag-demo
########################################################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$INFRA_DIR")"
AGENT_DIR="$ROOT_DIR/wiki-agent"
REGION="${AWS_REGION:-us-east-1}"

REPO_URL="${1:-}"
REPO_BRANCH="${2:-}"

if [ -z "$REPO_URL" ]; then
  echo "Usage: $0 <REPO_URL> [REPO_BRANCH]" >&2
  exit 1
fi

cd "$INFRA_DIR"

SRC_BUCKET=$(terraform output -raw wiki_generator_source_bucket)
SRC_KEY=$(terraform output -raw wiki_generator_source_key)
PROJECT=$(terraform output -raw wiki_generator_project)

if [ -z "$SRC_BUCKET" ] || [ -z "$PROJECT" ]; then
  echo "ERROR: could not read wiki_generator_* Terraform outputs. Run terraform apply first." >&2
  exit 1
fi

# --- Package the agent (buildspec.yml + code at the zip root) ---
echo "→ Packaging wiki-agent from $AGENT_DIR ..."
TMP_ZIP="$(mktemp -t wiki-agent-XXXX).zip"
trap 'rm -f "$TMP_ZIP"' EXIT
( cd "$AGENT_DIR" && zip -r -q "$TMP_ZIP" . -x '*.pyc' -x '__pycache__/*' )

echo "→ Uploading to s3://$SRC_BUCKET/$SRC_KEY ..."
aws s3 cp "$TMP_ZIP" "s3://$SRC_BUCKET/$SRC_KEY" --region "$REGION" >/dev/null

# --- Trigger the build with REPO_URL (and optional branch) override ---
OVERRIDES="name=REPO_URL,value=$REPO_URL,type=PLAINTEXT"
if [ -n "$REPO_BRANCH" ]; then
  OVERRIDES="$OVERRIDES name=REPO_BRANCH,value=$REPO_BRANCH,type=PLAINTEXT"
fi

echo "→ Starting build for $REPO_URL ..."
BUILD_ID=$(aws codebuild start-build \
  --project-name "$PROJECT" \
  --environment-variables-override $OVERRIDES \
  --region "$REGION" \
  --query 'build.id' --output text)

echo ""
echo "  ✓ Build started: $BUILD_ID"
echo ""
echo "  Follow logs:"
echo "    aws codebuild batch-get-builds --ids '$BUILD_ID' --region $REGION \\"
echo "      --query 'builds[0].logs.deepLink' --output text"
