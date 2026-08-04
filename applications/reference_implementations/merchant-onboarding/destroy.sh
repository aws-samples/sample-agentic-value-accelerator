#!/usr/bin/env bash
set -euo pipefail

echo "=== Merchant Onboarding Teardown ==="

if [ -f deploy.auto.tfvars.json ]; then
  export AWS_REGION=$(python3 -c "import json; print(json.load(open('deploy.auto.tfvars.json')).get('aws_region','us-east-2'))")
  PROJECT_NAME=$(python3 -c "import json; print(json.load(open('deploy.auto.tfvars.json')).get('project_name','merchant-onboarding'))")
else
  PROJECT_NAME="merchant-onboarding"
fi

REGION="${AWS_REGION:-us-east-2}"

echo "Destroying stacks for project: $PROJECT_NAME in $REGION"

cd infrastructure
pip3 install -r requirements.txt -q
npx cdk destroy --all \
  --force \
  --context project_name="$PROJECT_NAME" \
  --context aws_region="$REGION"
cd ..

# Clean up SSM parameter if it exists
aws ssm delete-parameter \
  --name "/${PROJECT_NAME}/sanctions-api-key" \
  --region "$REGION" 2>/dev/null || true

echo "=== Teardown complete ==="
