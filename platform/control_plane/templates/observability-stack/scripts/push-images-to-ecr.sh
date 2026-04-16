#!/usr/bin/env bash
set -euo pipefail

# Configuration — override via environment variables or edit defaults
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
LANGFUSE_VERSION="${LANGFUSE_VERSION:-3.161.0}"
CLICKHOUSE_VERSION="${CLICKHOUSE_VERSION:-24.12}"

ECR_BASE="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

REPOS=("langfuse" "langfuse-worker" "clickhouse-server")
SOURCE_IMAGES=(
  "langfuse/langfuse:${LANGFUSE_VERSION}"
  "langfuse/langfuse-worker:${LANGFUSE_VERSION}"
  "clickhouse/clickhouse-server:${CLICKHOUSE_VERSION}"
)
ECR_IMAGES=(
  "${ECR_BASE}/langfuse:${LANGFUSE_VERSION}"
  "${ECR_BASE}/langfuse-worker:${LANGFUSE_VERSION}"
  "${ECR_BASE}/clickhouse-server:${CLICKHOUSE_VERSION}"
)

echo "==> Account: ${AWS_ACCOUNT_ID}, Region: ${AWS_REGION}"

# 1. Create ECR repos (idempotent)
for repo in "${REPOS[@]}"; do
  if aws ecr describe-repositories --repository-names "$repo" --region "$AWS_REGION" &>/dev/null; then
    echo "==> ECR repo '${repo}' already exists"
  else
    echo "==> Creating ECR repo '${repo}'"
    aws ecr create-repository \
      --repository-name "$repo" \
      --region "$AWS_REGION" \
      --image-scanning-configuration scanOnPush=true \
      --output text --query 'repository.repositoryUri'
  fi
done

# 2. Login to ECR
echo "==> Logging in to ECR"
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$ECR_BASE"

# 3. Pull, tag, push
for i in "${!SOURCE_IMAGES[@]}"; do
  src="${SOURCE_IMAGES[$i]}"
  ecr="${ECR_IMAGES[$i]}"

  echo "==> Pulling ${src} (amd64)"
  docker pull --platform linux/amd64 "$src"

  echo "==> Tagging as ${ecr}"
  docker tag "$src" "$ecr"

  echo "==> Pushing ${ecr}"
  docker push "$ecr"
done

echo ""
echo "Done. Images pushed to ECR:"
for img in "${ECR_IMAGES[@]}"; do
  echo "  ${img}"
done
