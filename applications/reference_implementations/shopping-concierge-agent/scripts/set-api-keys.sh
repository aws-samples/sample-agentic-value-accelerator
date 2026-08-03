#!/bin/bash

# Script to set API keys in AWS Systems Manager Parameter Store
# Usage: ./scripts/set-api-keys.sh <deployment-id>
# The deployment id must match the sanitized AMPLIFY_ID that deploy.sh writes.

REGION="us-east-1"

DEPLOYMENT_ID="${1:-}"
if [ -z "$DEPLOYMENT_ID" ]; then
  if [ -f deployment-config.json ]; then
    DEPLOYMENT_ID=$(python3 -c "import json; print(json.load(open('deployment-config.json'))['deploymentId'])")
  else
    echo "Usage: $0 <deployment-id>"
    echo "(or run from a directory containing deployment-config.json)"
    exit 1
  fi
fi

echo "Setting API keys in AWS SSM Parameter Store (deployment: $DEPLOYMENT_ID)..."
echo ""

# SERP API Key (Product Search)
read -p "Enter SERP API Key (or press Enter to skip): " SERP_KEY
if [ ! -z "$SERP_KEY" ]; then
  aws ssm put-parameter \
    --name "/concierge-agent/${DEPLOYMENT_ID}/serp-api-key" \
    --value "$SERP_KEY" \
    --type "SecureString" \
    --overwrite \
    --region $REGION
  echo "SERP API key set"
fi

echo ""
echo "API keys configuration complete."
echo ""
echo "Note: After setting keys, redeploy the MCP servers:"
echo "  cd infrastructure/mcp-servers && cdk deploy ShoppingStack"
