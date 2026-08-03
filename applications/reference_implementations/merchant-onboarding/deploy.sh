#!/usr/bin/env bash
set -euo pipefail

echo "=== Merchant Onboarding Deployment ==="

# ── Read parameters from deploy.auto.tfvars.json (injected by AVA packaging service)
if [ -f deploy.auto.tfvars.json ]; then
  export AWS_REGION=$(python3 -c "import json; print(json.load(open('deploy.auto.tfvars.json')).get('aws_region','us-east-2'))")
  SANCTIONS_KEY=$(python3 -c "import json; print(json.load(open('deploy.auto.tfvars.json')).get('sanctions_api_key',''))")
  PROJECT_NAME=$(python3 -c "import json; print(json.load(open('deploy.auto.tfvars.json')).get('project_name','merchant-onboarding'))")
else
  SANCTIONS_KEY=""
  PROJECT_NAME="merchant-onboarding"
fi

REGION="${AWS_TARGET_REGION:-${AWS_REGION:-us-east-2}}"
export AWS_REGION="$REGION"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "Project: $PROJECT_NAME | Region: $REGION | Account: $ACCOUNT_ID"

# ── Store optional sanctions API key in SSM ───────────────────────────────────
if [ -n "${SANCTIONS_KEY:-}" ] && [ "$SANCTIONS_KEY" != "" ]; then
  echo "Storing sanctions API key in SSM..."
  aws ssm put-parameter \
    --name "/${PROJECT_NAME}/sanctions-api-key" \
    --value "$SANCTIONS_KEY" \
    --type "SecureString" \
    --overwrite \
    --region "$REGION" || echo "Warning: could not store sanctions key"
fi

# ── Ensure Node 20+ for CDK ───────────────────────────────────────────────────
NODE_VER=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo 0)
if [ -z "$NODE_VER" ] || [ "$NODE_VER" -lt 20 ]; then
  ARCH=$(uname -m)
  case "$ARCH" in
    aarch64|arm64) NODE_ARCH="linux-arm64" ;;
    x86_64)        NODE_ARCH="linux-x64"   ;;
    *)             echo "Unsupported arch: $ARCH"; exit 1 ;;
  esac
  echo "Upgrading Node.js to 22 ($NODE_ARCH)..."
  curl -fsSL "https://nodejs.org/dist/v22.15.0/node-v22.15.0-${NODE_ARCH}.tar.xz" | tar -xJ -C /usr/local --strip-components=1
fi

# ── Upgrade CDK CLI ───────────────────────────────────────────────────────────
echo "Upgrading CDK CLI..."
npm install -g aws-cdk@latest

# ── CDK bootstrap ─────────────────────────────────────────────────────────────
echo "Bootstrapping CDK..."
npx cdk bootstrap "aws://${ACCOUNT_ID}/${REGION}" || {
  echo "ERROR: CDK bootstrap failed"; exit 1
}

# ── Build React frontend ──────────────────────────────────────────────────────
echo "=== Step 1/3: Building frontend ==="
cd frontend
npm install --legacy-peer-deps
npm run build
cd ..

# ── Deploy CDK stacks ─────────────────────────────────────────────────────────
echo "=== Step 2/3: Deploying CDK stacks ==="
cd infrastructure
pip3 install -r requirements.txt -q
npx cdk deploy --all \
  --require-approval never \
  --context project_name="$PROJECT_NAME" \
  --context aws_region="$REGION" \
  --outputs-file /tmp/cdk-outputs.json
cd ..

# ── Collect outputs and write to control plane DynamoDB ───────────────────────
echo "=== Step 3/3: Collecting outputs ==="
python3 - <<'PYEOF'
import json, os

try:
    raw = json.load(open('/tmp/cdk-outputs.json'))
except Exception as e:
    print(f"Warning: could not read cdk-outputs.json: {e}")
    raw = {}

outputs = {"status": "success", "deployment_id": os.environ.get("DEPLOYMENT_ID", "")}
for stack_outputs in raw.values():
    for k, v in stack_outputs.items():
        key = k.lower().replace("-", "_")
        outputs[key] = v
        if "frontendurl" in k.lower() or "ui_url" in k.lower():
            outputs["ui_url"] = v

print(f"Collected {len(outputs)} outputs")
json.dump(outputs, open('/tmp/outputs.json', 'w'))

# Write outputs to the control plane DynamoDB using AWS_DEFAULT_REGION
# (the CodeBuild execution region, where the control plane table lives),
# NOT AWS_TARGET_REGION (the deployment region, where the app was deployed).
table_name = os.environ.get('DEPLOYMENTS_TABLE', '')
deployment_id = os.environ.get('DEPLOYMENT_ID', '')
cp_region = os.environ.get('AWS_DEFAULT_REGION', 'us-east-2')
if table_name and deployment_id:
    try:
        import boto3
        ddb = boto3.resource('dynamodb', region_name=cp_region)
        table = ddb.Table(table_name)
        clean = {k: v for k, v in outputs.items() if k not in ('deployment_id', 'status')}
        if clean:
            table.update_item(
                Key={'pk': f'DEPLOY#{deployment_id}', 'sk': 'META'},
                UpdateExpression='SET outputs = :o',
                ExpressionAttributeValues={':o': clean},
            )
            print(f"Stored {len(clean)} outputs to DynamoDB ({cp_region})")
    except Exception as e:
        print(f"Warning: could not write outputs to DynamoDB: {e}")
PYEOF

echo "=== Deployment complete ==="
cat /tmp/outputs.json 2>/dev/null || true
