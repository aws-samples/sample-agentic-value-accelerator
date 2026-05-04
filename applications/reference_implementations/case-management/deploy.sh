#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# End-to-End Deployment Script
# Deploys the full Case Management / Fraud Detection pipeline:
#
#   Step 1 — DynamoDB tables (5 tables, idempotent)
#   Step 2 — AgentCore SAR Agent + Memory (optional, skips if CLI missing)
#   Step 3 — Lambda functions (4 Lambdas + IAM roles)
#   Step 4 — API Gateway + React build
#   Step 5 — Sample transaction data (soft step, non-fatal on failure)
#
# Prerequisites:
#   - AWS CLI configured, Node.js 20+, Python 3.10+
#   - .env file with AWS credentials (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
#   - Bedrock model access enabled
#   - Optional: agentcore CLI, SageMaker endpoint
#
# Usage:
#   bash deploy.sh
#
# Re-running is safe — every step is idempotent.
# ============================================================

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Source .env file if it exists
if [ -f "$ROOT/.env" ]; then
  echo "Loading credentials from .env..."
  export $(grep -v '^#' "$ROOT/.env" | grep -v '^$' | xargs)
fi

# Extract REGION from AWS_REGION if REGION not set
REGION="${REGION:-${AWS_REGION:-us-east-1}}"
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
ENDPOINT_NAME="${ENDPOINT_NAME:-fraud-xgb-placeholder}"
SKIP_AGENTCORE=false

# Check if agentcore is available
if ! command -v agentcore &> /dev/null; then
  echo "⚠️  agentcore CLI not found - will skip AgentCore deployment (Step 2)"
  SKIP_AGENTCORE=true
fi

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Case Management — E2E Deployment                       ║"
echo "║  Account: ${ACCOUNT_ID}  Region: ${REGION}              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────
table_exists() { aws dynamodb describe-table --region "$REGION" --table-name "$1" >/dev/null 2>&1; }
wait_active()  { aws dynamodb wait table-exists --region "$REGION" --table-name "$1"; sleep 2; }

create_role() {
  local role="$1"
  if aws iam get-role --role-name "$role" >/dev/null 2>&1; then
    echo "    Role $role exists"
  else
    echo "    Creating role $role..."
    aws iam create-role --role-name "$role" \
      --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
      --query "Role.Arn" --output text
    sleep 10
  fi
}

deploy_lambda() {
  local name="$1" handler="$2" zip="$3" role="$4" envvars="$5" tout="${6:-30}" mem="${7:-256}"
  local role_arn="arn:aws:iam::${ACCOUNT_ID}:role/${role}"
  if aws lambda get-function --function-name "$name" --region "$REGION" >/dev/null 2>&1; then
    echo "    Updating $name..."
    aws lambda update-function-code --function-name "$name" \
      --zip-file "fileb://$zip" --region "$REGION" --output text --query "LastModified"
    # Wait for code update to finish before updating config
    aws lambda wait function-updated --function-name "$name" --region "$REGION" 2>/dev/null || sleep 5
    aws lambda update-function-configuration --function-name "$name" --region "$REGION" \
      --role "$role_arn" --timeout "$tout" --memory-size "$mem" --environment "$envvars" \
      --output text --query "LastModified"
  else
    echo "    Creating $name..."
    aws lambda create-function --function-name "$name" --runtime python3.12 --handler "$handler" \
      --zip-file "fileb://$zip" --role "$role_arn" \
      --timeout "$tout" --memory-size "$mem" --environment "$envvars" \
      --region "$REGION" --query "FunctionArn" --output text
  fi
}

# ────────────────────────────────────────────────────────────
# STEP 1 — DynamoDB Tables
# ────────────────────────────────────────────────────────────
echo "═══ Step 1/4: DynamoDB Tables ═══"

if table_exists txn_features; then echo "  ✓ txn_features exists"; else
  echo "  Creating txn_features..."
  aws dynamodb create-table --region "$REGION" --table-name txn_features --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE >/dev/null
  wait_active txn_features
  aws dynamodb update-time-to-live --region "$REGION" --table-name txn_features \
    --time-to-live-specification "Enabled=true, AttributeName=ttl" >/dev/null
fi

if table_exists pair_stats; then echo "  ✓ pair_stats exists"; else
  echo "  Creating pair_stats..."
  aws dynamodb create-table --region "$REGION" --table-name pair_stats --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE >/dev/null
  wait_active pair_stats
fi

if table_exists txn_logs; then echo "  ✓ txn_logs exists"; else
  echo "  Creating txn_logs..."
  aws dynamodb create-table --region "$REGION" --table-name txn_logs --billing-mode PAY_PER_REQUEST \
    --attribute-definitions \
      AttributeName=pk,AttributeType=S \
      AttributeName=txn_id,AttributeType=S \
      AttributeName=src,AttributeType=S \
      AttributeName=dst,AttributeType=S \
      AttributeName=decision,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH \
    --global-secondary-indexes '[
      {"IndexName":"GSI1_txn_id","KeySchema":[{"AttributeName":"txn_id","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}},
      {"IndexName":"GSI2_src","KeySchema":[{"AttributeName":"src","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}},
      {"IndexName":"GSI3_dst","KeySchema":[{"AttributeName":"dst","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}},
      {"IndexName":"GSI4_decision","KeySchema":[{"AttributeName":"decision","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}
    ]' >/dev/null
  wait_active txn_logs
  aws dynamodb update-time-to-live --region "$REGION" --table-name txn_logs \
    --time-to-live-specification "Enabled=true, AttributeName=expire_ts" >/dev/null
fi

if table_exists dst_src_window; then echo "  ✓ dst_src_window exists"; else
  echo "  Creating dst_src_window..."
  aws dynamodb create-table --region "$REGION" --table-name dst_src_window --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE >/dev/null
  wait_active dst_src_window
  aws dynamodb update-time-to-live --region "$REGION" --table-name dst_src_window \
    --time-to-live-specification "Enabled=true, AttributeName=expire_ts" >/dev/null
fi

if table_exists actor_state; then echo "  ✓ actor_state exists"; else
  echo "  Creating actor_state..."
  aws dynamodb create-table --region "$REGION" --table-name actor_state --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=pk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH >/dev/null
  wait_active actor_state
fi

echo "  ✓ All 5 tables ready"
echo ""

# ────────────────────────────────────────────────────────────
# STEP 2 — AgentCore SAR Agent
# ────────────────────────────────────────────────────────────
echo "═══ Step 2/4: AgentCore SAR Agent ═══"

AGENTCORE_RUNTIME_ID="none"
AGENTCORE_ROLE_NAME=""

if [ "$SKIP_AGENTCORE" = true ]; then
  echo "  ⚠️  Skipping AgentCore deployment (CLI not installed)"
  echo "  ℹ️  To install: pip install agentcore-cli"
  echo "  ℹ️  SAR report generation will be disabled in the UI"
else
  cd "$ROOT/agentcore_sars"

  # Write aws-targets.json for current account/region
  cat > agentcore/aws-targets.json << TARGETS
[
  {
    "name": "default",
    "region": "${REGION}",
    "account": "${ACCOUNT_ID}"
  }
]
TARGETS

  # Deploy agent
  echo "  Deploying AgentCore agent..."
  AWS_DEFAULT_REGION="$REGION" AWS_REGION="$REGION" agentcore deploy --yes --target default

  # Add memory if not already present
  MEMORY_CHECK=$(python3 -c "import json; d=json.load(open('agentcore/agentcore.json')); print(len(d.get('memories',[])))" 2>/dev/null || echo "0")
  if [ "$MEMORY_CHECK" = "0" ]; then
    echo "  Adding memory..."
    AWS_DEFAULT_REGION="$REGION" agentcore add memory --name SARMemory --strategies SEMANTIC,SUMMARIZATION --expiry 90 --json >/dev/null 2>&1 || true
  fi

  # Ensure runtime is present (add memory can clear it)
  RUNTIME_CHECK=$(python3 -c "import json; d=json.load(open('agentcore/agentcore.json')); print(len(d.get('runtimes',[])))" 2>/dev/null || echo "0")
  if [ "$RUNTIME_CHECK" = "0" ]; then
    echo "  Re-adding agent runtime..."
    AWS_DEFAULT_REGION="$REGION" agentcore add agent --name SARAgent --type byo --language Python --framework Strands --model-provider Bedrock --code-location app/SARAgent/ --entrypoint main.py --protocol HTTP --network-mode PUBLIC --json >/dev/null 2>&1 || true
  fi

  # Re-write aws-targets.json (add commands can clear it)
  cat > agentcore/aws-targets.json << TARGETS2
[
  {
    "name": "default",
    "region": "${REGION}",
    "account": "${ACCOUNT_ID}"
  }
]
TARGETS2

  # Final deploy
  AWS_DEFAULT_REGION="$REGION" AWS_REGION="$REGION" agentcore deploy --yes --target default

  # Extract runtime ID and role from deployed state
  DEPLOYED_STATE="agentcore/.cli/deployed-state.json"
  if [ -f "$DEPLOYED_STATE" ]; then
    AGENTCORE_RUNTIME_ID=$(python3 -c "
import json
d = json.load(open('$DEPLOYED_STATE'))
rt = d['targets']['default']['resources']['runtimes']
print(list(rt.values())[0]['runtimeId'])
" 2>/dev/null || echo "none")
    AGENTCORE_ROLE_ARN=$(python3 -c "
import json
d = json.load(open('$DEPLOYED_STATE'))
rt = d['targets']['default']['resources']['runtimes']
print(list(rt.values())[0]['roleArn'])
" 2>/dev/null || echo "")
    AGENTCORE_ROLE_NAME=$(echo "$AGENTCORE_ROLE_ARN" | sed 's|.*/||')

    echo "  Runtime ID: ${AGENTCORE_RUNTIME_ID}"
    echo "  Role:       ${AGENTCORE_ROLE_NAME}"

    # Grant DynamoDB read access to the AgentCore role
    if [ -n "$AGENTCORE_ROLE_NAME" ]; then
      aws iam put-role-policy --role-name "$AGENTCORE_ROLE_NAME" \
        --policy-name DynamoDBTxnLogsReadAccess \
        --policy-document "{
          \"Version\": \"2012-10-17\",
          \"Statement\": [{
            \"Effect\": \"Allow\",
            \"Action\": [\"dynamodb:GetItem\", \"dynamodb:Query\", \"dynamodb:Scan\"],
            \"Resource\": [
              \"arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/txn_logs\",
              \"arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/txn_logs/index/*\"
            ]
          }]
        }"
      echo "  ✓ DynamoDB access granted to AgentCore role"
    fi
  else
    echo "  ⚠️  Deployed state not found - AgentCore may not have deployed correctly"
    AGENTCORE_RUNTIME_ID="none"
  fi

  cd "$ROOT"
fi
echo ""

# ────────────────────────────────────────────────────────────
# STEP 3 — Lambda Functions
# ────────────────────────────────────────────────────────────
echo "═══ Step 3/4: Lambda Functions ═══"

# --- 3a: fraud-scoring ---
echo "  [1/4] fraud-scoring"
create_role "fraud-scoring-lambda-role"

sed "s/<<REGION>>/${REGION}/g; s/<<ACCOUNT_ID>>/${ACCOUNT_ID}/g; s/<<ENDPOINT_NAME>>/${ENDPOINT_NAME}/g" \
  "$ROOT/backend/lambda_execution_policy.json" > /tmp/fraud-scoring-policy.json
python3 "$ROOT/backend/strip_json_comments.py" /tmp/fraud-scoring-policy.json

aws iam put-role-policy --role-name fraud-scoring-lambda-role \
  --policy-name fraud-scoring-policy --policy-document file:///tmp/fraud-scoring-policy.json

zip -j /tmp/fraud-scoring.zip "$ROOT/backend/lambda_function_12f.py"
deploy_lambda "fraud-scoring" "lambda_function_12f.lambda_handler" "/tmp/fraud-scoring.zip" \
  "fraud-scoring-lambda-role" \
  "Variables={TABLE_FEATURES=txn_features,TABLE_PAIRS=pair_stats,ENDPOINT_NAME=${ENDPOINT_NAME},TABLE_TXN_LOGS=txn_logs,TABLE_DSTSRC=dst_src_window,TABLE_ACTOR_STATE=actor_state}"

# --- 3b: txn-reader ---
echo "  [2/4] txn-reader"
create_role "txn-reader-lambda-role"

# Fix: original dynamodb-policy.json lacks CloudWatch Logs — build a complete policy
cat > /tmp/txn-reader-policy.json << TXNPOL
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/aws/lambda/txn-reader:*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:Scan", "dynamodb:Query", "dynamodb:GetItem"],
      "Resource": [
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/txn_logs",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/txn_logs/index/*"
      ]
    }
  ]
}
TXNPOL

aws iam put-role-policy --role-name txn-reader-lambda-role \
  --policy-name txn-reader-policy --policy-document file:///tmp/txn-reader-policy.json

zip -j /tmp/txn-reader.zip "$ROOT/backend/lambda_dynamodb.py"
deploy_lambda "txn-reader" "lambda_dynamodb.lambda_handler" "/tmp/txn-reader.zip" \
  "txn-reader-lambda-role" \
  "Variables={TABLE_TXN_LOGS=txn_logs}" 15 128

# --- 3c: sar-api ---
echo "  [3/4] sar-api"
create_role "sar-api-lambda-role"

sed "s/<<REGION>>/${REGION}/g; s/<<ACCOUNT_ID>>/${ACCOUNT_ID}/g" \
  "$ROOT/backend/sar_api_policy.json" > /tmp/sar-api-policy.json

aws iam put-role-policy --role-name sar-api-lambda-role \
  --policy-name sar-api-policy --policy-document file:///tmp/sar-api-policy.json

zip -j /tmp/sar-api.zip "$ROOT/backend/sar_api.py"
deploy_lambda "sar-api" "sar_api.lambda_handler" "/tmp/sar-api.zip" \
  "sar-api-lambda-role" \
  "Variables={TABLE_TXN_LOGS=txn_logs,AGENTCORE_RUNTIME_ID=${AGENTCORE_RUNTIME_ID}}" 60 256

# --- 3d: bedrock-chat ---
echo "  [4/4] bedrock-chat"
create_role "bedrock-chat-lambda-role"

cat > /tmp/bedrock-chat-policy.json << BPOL
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/aws/lambda/bedrock-chat:*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan"],
      "Resource": [
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/txn_logs",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/txn_logs/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      "Resource": [
        "arn:aws:bedrock:*:${ACCOUNT_ID}:inference-profile/*",
        "arn:aws:bedrock:*::foundation-model/*"
      ]
    }
  ]
}
BPOL

aws iam put-role-policy --role-name bedrock-chat-lambda-role \
  --policy-name bedrock-chat-policy --policy-document file:///tmp/bedrock-chat-policy.json

zip -j /tmp/bedrock-chat.zip "$ROOT/backend/bedrock_chat.py"
deploy_lambda "bedrock-chat" "bedrock_chat.lambda_handler" "/tmp/bedrock-chat.zip" \
  "bedrock-chat-lambda-role" \
  "Variables={TABLE_TXN_LOGS=txn_logs}" 60 256

echo "  ✓ All 4 Lambdas deployed"
echo ""

# ────────────────────────────────────────────────────────────
# STEP 4 — API Gateway + React Build
# ────────────────────────────────────────────────────────────
echo "═══ Step 4/4: API Gateway + React UI ═══"

API_NAME="sar-api-gateway"
API_ID=$(aws apigatewayv2 get-apis --region "$REGION" \
  --query "Items[?Name=='${API_NAME}'].ApiId" --output text 2>/dev/null || echo "")

if [ -z "$API_ID" ]; then
  echo "  Creating API Gateway..."
  API_ID=$(aws apigatewayv2 create-api --region "$REGION" \
    --name "$API_NAME" --protocol-type HTTP \
    --cors-configuration '{"AllowOrigins":["*"],"AllowMethods":["GET","POST","OPTIONS"],"AllowHeaders":["Content-Type"]}' \
    --query "ApiId" --output text)

  # sar-api integration (transactions, sars-report, chat)
  SAR_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:sar-api"
  INTEG_ID=$(aws apigatewayv2 create-integration --region "$REGION" \
    --api-id "$API_ID" --integration-type AWS_PROXY \
    --integration-uri "$SAR_ARN" --payload-format-version "2.0" \
    --query "IntegrationId" --output text)

  for route in "POST /api/sars-report" "POST /api/chat" "GET /api/transactions" "OPTIONS /api/{proxy+}"; do
    aws apigatewayv2 create-route --region "$REGION" \
      --api-id "$API_ID" --route-key "$route" \
      --target "integrations/${INTEG_ID}" >/dev/null
    echo "    Route: $route"
  done

  # fraud-scoring integration
  SCORING_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:fraud-scoring"
  SCORING_INTEG=$(aws apigatewayv2 create-integration --region "$REGION" \
    --api-id "$API_ID" --integration-type AWS_PROXY \
    --integration-uri "$SCORING_ARN" --payload-format-version "2.0" \
    --query "IntegrationId" --output text)
  aws apigatewayv2 create-route --region "$REGION" \
    --api-id "$API_ID" --route-key "POST /fraudscore" \
    --target "integrations/${SCORING_INTEG}" >/dev/null
  aws lambda add-permission --function-name fraud-scoring \
    --statement-id "apigateway-scoring" --action "lambda:InvokeFunction" \
    --principal "apigateway.amazonaws.com" \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*" \
    --region "$REGION" >/dev/null 2>&1 || true
  echo "    Route: POST /fraudscore → fraud-scoring"

  # bedrock-chat integration
  CHAT_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:bedrock-chat"
  CHAT_INTEG=$(aws apigatewayv2 create-integration --region "$REGION" \
    --api-id "$API_ID" --integration-type AWS_PROXY \
    --integration-uri "$CHAT_ARN" --payload-format-version "2.0" \
    --query "IntegrationId" --output text)
  aws apigatewayv2 create-route --region "$REGION" \
    --api-id "$API_ID" --route-key "POST /api/bedrock-chat" \
    --target "integrations/${CHAT_INTEG}" >/dev/null
  aws apigatewayv2 create-route --region "$REGION" \
    --api-id "$API_ID" --route-key "GET /api/bedrock-chat/models" \
    --target "integrations/${CHAT_INTEG}" >/dev/null
  aws lambda add-permission --function-name bedrock-chat \
    --statement-id "apigateway-bedrock-chat" --action "lambda:InvokeFunction" \
    --principal "apigateway.amazonaws.com" \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*" \
    --region "$REGION" >/dev/null 2>&1 || true
  echo "    Route: POST /api/bedrock-chat → bedrock-chat"
  echo "    Route: GET  /api/bedrock-chat/models → bedrock-chat"

  # Stage + sar-api permission
  aws apigatewayv2 create-stage --region "$REGION" \
    --api-id "$API_ID" --stage-name prod --auto-deploy >/dev/null
  aws lambda add-permission --function-name sar-api \
    --statement-id "apigateway-invoke" --action "lambda:InvokeFunction" \
    --principal "apigateway.amazonaws.com" \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*" \
    --region "$REGION" >/dev/null 2>&1 || true
else
  echo "  API Gateway exists: ${API_ID}"
fi

API_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com/prod"
echo "  ✓ API: ${API_URL}"

# --- React build ---
echo "  Building React UI..."
cd "$ROOT/UI"

cat > public/config.json << UICFG
{
  "API_BASE_URL": "${API_URL}/api/transactions",
  "SAR_API_URL": "${API_URL}",
  "ENABLE_API_CALLS": true,
  "DEV_SETTINGS": { "LOG_API_CALLS": true, "TIMEOUT": 30000, "USE_CORS_PROXY": false },
  "UI_SETTINGS": { "THEME": "amazon", "SIDEBAR_WIDTH": 200, "HEADER_HEIGHT": 80, "ENABLE_REFRESH": true }
}
UICFG

npm install --silent 2>&1 | tail -1
npm run build 2>&1 | tail -3

# --- S3 Frontend Deployment ---
echo "  Deploying frontend to S3 + CloudFront..."

BUCKET_NAME="case-management-ui-${ACCOUNT_ID}"

# Create bucket if it doesn't exist
if aws s3 ls "s3://${BUCKET_NAME}" 2>/dev/null; then
  echo "    Bucket ${BUCKET_NAME} exists"
else
  echo "    Creating S3 bucket ${BUCKET_NAME}..."
  if [ "$REGION" = "us-east-1" ]; then
    aws s3 mb "s3://${BUCKET_NAME}" --region "$REGION"
  else
    aws s3 mb "s3://${BUCKET_NAME}" --region "$REGION" --create-bucket-configuration LocationConstraint="$REGION"
  fi
fi

# Enable block public access (secure)
echo "    Configuring secure bucket access..."
aws s3api put-public-access-block --bucket "${BUCKET_NAME}" \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Upload build files
echo "    Uploading build files..."
aws s3 sync build/ "s3://${BUCKET_NAME}/" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*.html" \
  --exclude "config.json"

# Upload HTML and config.json with no-cache
aws s3 sync build/ "s3://${BUCKET_NAME}/" \
  --exclude "*" \
  --include "*.html" \
  --include "config.json" \
  --cache-control "no-cache, no-store, must-revalidate"

# Create Origin Access Control (OAC) for CloudFront
echo "    Setting up CloudFront..."
OAC_ID=$(aws cloudfront list-origin-access-controls --query "OriginAccessControlList.Items[?Name=='${BUCKET_NAME}-oac'].Id" --output text 2>/dev/null || echo "")

if [ -z "$OAC_ID" ]; then
  OAC_ID=$(aws cloudfront create-origin-access-control \
    --origin-access-control-config "{
      \"Name\": \"${BUCKET_NAME}-oac\",
      \"Description\": \"OAC for Case Management UI\",
      \"SigningProtocol\": \"sigv4\",
      \"SigningBehavior\": \"always\",
      \"OriginAccessControlOriginType\": \"s3\"
    }" --query "OriginAccessControl.Id" --output text)
  echo "    Created OAC: ${OAC_ID}"
else
  echo "    OAC exists: ${OAC_ID}"
fi

# Check if CloudFront distribution exists
CF_DIST_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Origins.Items[0].DomainName=='${BUCKET_NAME}.s3.${REGION}.amazonaws.com'].Id" --output text 2>/dev/null || echo "")

if [ -z "$CF_DIST_ID" ]; then
  echo "    Creating CloudFront distribution..."

  cat > /tmp/cf-config.json << CFCONFIG
{
  "CallerReference": "case-mgmt-${ACCOUNT_ID}-$(date +%s)",
  "Comment": "Case Management UI Distribution",
  "Enabled": true,
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "${BUCKET_NAME}-origin",
        "DomainName": "${BUCKET_NAME}.s3.${REGION}.amazonaws.com",
        "S3OriginConfig": {
          "OriginAccessIdentity": ""
        },
        "OriginAccessControlId": "${OAC_ID}"
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "${BUCKET_NAME}-origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": {
        "Quantity": 2,
        "Items": ["GET", "HEAD"]
      }
    },
    "Compress": true,
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {"Forward": "none"}
    },
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000
  },
  "CustomErrorResponses": {
    "Quantity": 1,
    "Items": [
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 300
      }
    ]
  }
}
CFCONFIG

  CF_DIST_ID=$(aws cloudfront create-distribution --distribution-config file:///tmp/cf-config.json --query "Distribution.Id" --output text)
  echo "    CloudFront distribution created: ${CF_DIST_ID}"
  echo "    Waiting for deployment (this may take 5-10 minutes)..."
else
  echo "    CloudFront distribution exists: ${CF_DIST_ID}"
fi

# Update bucket policy to allow CloudFront OAC access
CF_ARN=$(aws cloudfront get-distribution --id "$CF_DIST_ID" --query "Distribution.ARN" --output text)

cat > /tmp/bucket-policy.json << BPOLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${BUCKET_NAME}/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "${CF_ARN}"
        }
      }
    }
  ]
}
BPOLICY

aws s3api put-bucket-policy --bucket "${BUCKET_NAME}" --policy file:///tmp/bucket-policy.json

# Get CloudFront domain
CF_DOMAIN=$(aws cloudfront get-distribution --id "$CF_DIST_ID" --query "Distribution.DomainName" --output text)
WEBSITE_URL="https://${CF_DOMAIN}"
echo "  ✓ Frontend deployed: ${WEBSITE_URL}"

cd "$ROOT"
echo ""

# ────────────────────────────────────────────────────────────
# Done
# ────────────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Deployment Complete                                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  🌐 Frontend:   ${WEBSITE_URL}"
echo "  🔌 API:        ${API_URL}"
echo "  🤖 AgentCore:  ${AGENTCORE_RUNTIME_ID}"
echo "  🎯 SageMaker:  ${ENDPOINT_NAME}"
echo ""
echo "  API Routes:"
echo "    POST ${API_URL}/fraudscore"
echo "    GET  ${API_URL}/api/transactions"
echo "    POST ${API_URL}/api/sars-report"
echo "    POST ${API_URL}/api/chat"
echo "    POST ${API_URL}/api/bedrock-chat"
echo ""
echo "  🚀 Your application is live!"
echo "  📱 Open the frontend URL in your browser to get started"

# Step 5 — Sample data (soft step). Populates txn_logs so the UI isn't empty
# on first load. Failures are logged but don't fail the deploy.
echo ""
echo "═══ Step 5/5: Seeding sample transaction data ═══"
if [ -f "$ROOT/load_sample_data.sh" ]; then
  # Zip unpack drops the exec bit — restore it before running.
  chmod +x "$ROOT/load_sample_data.sh"
  if AWS_REGION="$REGION" "$ROOT/load_sample_data.sh"; then
    echo "  ✓ Sample data loaded"
  else
    echo "  ⚠️  Sample data load failed (non-fatal — deploy still succeeded)"
  fi
else
  echo "  ⚠️  load_sample_data.sh not found — skipping"
fi

# Surface outputs to the control-plane buildspec. Keys are aligned with what
# the Deployment Detail page looks for (ui_url / app_url → "Open App") plus
# the other useful handles for debugging.
cat > /tmp/outputs.json <<JSON
{
  "ui_url":               "${WEBSITE_URL:-}",
  "api_endpoint":         "${API_URL:-}",
  "agentcore_runtime_id": "${AGENTCORE_RUNTIME_ID:-}",
  "sagemaker_endpoint":   "${ENDPOINT_NAME:-}",
  "region":               "${REGION:-us-east-1}"
}
JSON
echo "  📤 Outputs written to /tmp/outputs.json"
