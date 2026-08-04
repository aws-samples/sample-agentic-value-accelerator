#!/usr/bin/env bash
set -euo pipefail

echo "=== AgentCore in a Box Teardown ==="

if [ -f deploy.auto.tfvars.json ]; then
  PARAM_REGION=$(python3 -c "import json; print(json.load(open('deploy.auto.tfvars.json')).get('aws_region',''))")
  PROJECT_NAME=$(python3 -c "import json; print(json.load(open('deploy.auto.tfvars.json')).get('project_name','agentcore-in-a-box'))")
else
  PARAM_REGION=""
  PROJECT_NAME="agentcore-in-a-box"
fi

REGION="${AWS_TARGET_REGION:-${PARAM_REGION:-us-west-2}}"
export AWS_REGION="$REGION"
export CDK_DEFAULT_REGION="$REGION"

# The upstream _destroy_internal.sh reads DEMO_ENV (or .demo-env) to know which
# instance to tear down. Use the same short suffix scheme as deploy.sh so the
# two match: 'u' + first 6 hex chars of the deployment UUID.
if [ -n "${DEPLOYMENT_ID:-}" ]; then
  _DEMO_SUFFIX=$(echo "${DEPLOYMENT_ID}" | tr -d '-' | cut -c1-6)
  export DEMO_ENV="u${_DEMO_SUFFIX}"
else
  export DEMO_ENV="${PROJECT_NAME}"
fi

echo "Project: $PROJECT_NAME | Region: $REGION | DEMO_ENV: $DEMO_ENV"

chmod +x ./_destroy_internal.sh
./_destroy_internal.sh

echo "=== Teardown complete ==="
