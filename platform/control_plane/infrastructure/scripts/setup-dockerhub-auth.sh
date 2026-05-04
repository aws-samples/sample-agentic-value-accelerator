#!/bin/bash
# Setup Docker Hub authentication for Langfuse deployment
#
# The foundation stack pulls Docker images (Langfuse, ClickHouse) from Docker Hub
# during deployment. Unauthenticated pulls are rate-limited to 100 pulls/6hrs,
# which can cause deployment failures in CodeBuild.
#
# This script stores Docker Hub credentials in AWS Secrets Manager so that
# CodeBuild can authenticate before pulling (200 pulls/6hrs with free account).
#
# Usage:
#   ./setup-dockerhub-auth.sh
#   ./setup-dockerhub-auth.sh --username myuser --token dckr_pat_xxx --region us-east-1
#
# Prerequisites:
#   1. A Docker Hub account (free tier is fine): https://hub.docker.com/signup
#   2. A Docker Hub access token with Read access:
#      - Go to https://hub.docker.com/settings/security
#      - Click "New Access Token"
#      - Name: "codebuild-pull" (or any name)
#      - Permissions: "Read-only"
#      - Click "Generate" and copy the token
#   3. AWS credentials configured for the target account
#
# The credentials are stored in Secrets Manager as "dockerhub-credentials"
# and are OPTIONAL — deployments work without them but may hit rate limits.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Parse arguments
USERNAME=""
TOKEN=""
REGION="${AWS_REGION:-us-east-1}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --username) USERNAME="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
done

# Prompt if not provided
if [ -z "$USERNAME" ]; then
  read -p "Docker Hub username: " USERNAME
fi
if [ -z "$TOKEN" ]; then
  read -s -p "Docker Hub access token: " TOKEN
  echo
fi

if [ -z "$USERNAME" ] || [ -z "$TOKEN" ]; then
  echo -e "${RED}Both username and token are required.${NC}"
  exit 1
fi

# Verify credentials
echo "Verifying Docker Hub credentials..."
echo "$TOKEN" | docker login --username "$USERNAME" --password-stdin 2>/dev/null
if [ $? -ne 0 ]; then
  echo -e "${RED}Docker Hub authentication failed. Check your credentials.${NC}"
  exit 1
fi
docker logout >/dev/null 2>&1
echo -e "${GREEN}Credentials verified.${NC}"

# Store in Secrets Manager
SECRET_NAME="dockerhub-credentials"
SECRET_VALUE="{\"username\":\"${USERNAME}\",\"token\":\"${TOKEN}\"}"

if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" >/dev/null 2>&1; then
  aws secretsmanager put-secret-value \
    --secret-id "$SECRET_NAME" \
    --secret-string "$SECRET_VALUE" \
    --region "$REGION" >/dev/null
  echo -e "${GREEN}Updated existing secret: ${SECRET_NAME}${NC}"
else
  aws secretsmanager create-secret \
    --name "$SECRET_NAME" \
    --secret-string "$SECRET_VALUE" \
    --region "$REGION" \
    --tags Key=managed_by,Value=fsi-agent-kit >/dev/null
  echo -e "${GREEN}Created secret: ${SECRET_NAME}${NC}"
fi

echo
echo -e "${GREEN}Docker Hub auth configured.${NC}"
echo "CodeBuild will authenticate before pulling images, avoiding rate limits."
echo "This is optional — deployments work without it but may be slower."
