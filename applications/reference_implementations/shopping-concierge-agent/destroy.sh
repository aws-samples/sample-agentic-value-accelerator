#!/bin/bash
set -euo pipefail

echo "=== Shopping Concierge Agent Destroy ==="

# Read parameters from tfvars if present
if [ -f deploy.auto.tfvars.json ]; then
  export AWS_REGION=$(python3 -c "import json; print(json.load(open('deploy.auto.tfvars.json')).get('aws_region','us-east-1'))")
  DEPLOY_NAME=$(python3 -c "import json; print(json.load(open('deploy.auto.tfvars.json')).get('project_name','shopping'))")
else
  DEPLOY_NAME="shopping"
fi

echo "Destroy target: $DEPLOY_NAME in $AWS_REGION"

# Override deployment config so CDK finds the right stacks
echo "{\"deploymentId\": \"$DEPLOY_NAME\"}" > deployment-config.json

# Install dependencies
npm install
cd amplify && npm install && cd ..

# Install CDK if not present
npm install -g aws-cdk typescript ts-node

# Destroy in reverse order of deployment

# Step 1: Frontend
echo "=== Step 1/4: Destroying frontend stack ==="
cd infrastructure/frontend-stack && npm install
npx cdk destroy "FrontendStack-${DEPLOY_NAME}" --force 2>&1 || echo "Warning: Frontend stack destroy failed or already deleted"
cd ../..

# Step 2: Agent (Runtime + Gateway + Memory)
echo "=== Step 2/4: Destroying agent stack ==="
cd infrastructure/agent-stack && npm install
npx cdk destroy "AgentStack-${DEPLOY_NAME}" --force 2>&1 || echo "Warning: Agent stack destroy failed or already deleted"
cd ../..

# Step 3: MCP Servers (Cart + Shopping)
echo "=== Step 3/4: Destroying MCP server stacks ==="
cd infrastructure/mcp-servers && npm install
npx cdk destroy --all --force 2>&1 || echo "Warning: MCP stacks destroy failed or already deleted"
cd ../..

# Step 4: Amplify Backend (Cognito, DynamoDB, AppSync)
echo "=== Step 4/4: Destroying Amplify backend ==="
npx ampx sandbox delete --yes 2>&1 || echo "Warning: ampx sandbox delete failed, falling back to CloudFormation delete"
# Fallback: delete the root Amplify CloudFormation stack directly
AMPLIFY_STACK=$(aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query "StackSummaries[?starts_with(StackName, \`amplify-sampleconciergeagent-${DEPLOY_NAME}-sandbox\`) && !contains(StackName, \`NestedStack\`)].StackName | [0]" \
  --output text --region "${AWS_REGION}" 2>/dev/null)
if [ -n "$AMPLIFY_STACK" ] && [ "$AMPLIFY_STACK" != "None" ]; then
  echo "Deleting Amplify root stack: $AMPLIFY_STACK"
  aws cloudformation delete-stack --stack-name "$AMPLIFY_STACK" --region "${AWS_REGION}" 2>/dev/null
  aws cloudformation wait stack-delete-complete --stack-name "$AMPLIFY_STACK" --region "${AWS_REGION}" 2>/dev/null || echo "Warning: Amplify stack delete timed out"
fi

# Clean up SSM parameter
echo "Cleaning up SSM parameters..."
aws ssm delete-parameter \
  --name "/concierge-agent/${DEPLOY_NAME}/serp-api-key" \
  --region "${AWS_REGION}" 2>/dev/null || echo "SSM parameter already deleted or not found"

# Write outputs
echo '{"deployment_id":"'"${DEPLOYMENT_ID:-unknown}"'","status":"destroyed"}' > /tmp/outputs.json

echo "=== Destroy complete ==="
