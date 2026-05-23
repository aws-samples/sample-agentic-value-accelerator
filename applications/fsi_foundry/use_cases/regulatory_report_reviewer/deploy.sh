#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────
STACK_NAME="${STACK_NAME:-reg-report-reviewer}"
AGENT_NAME="${AGENT_NAME:-regulatory_report_reviewer_agent}"
REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="${STACK_NAME}-agent"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "══════════════════════════════════════════════════════════"
echo "  Regulatory Report Reviewer — S3 File Processing Pattern"
echo "  Account:  ${ACCOUNT_ID}"
echo "  Region:   ${REGION}"
echo "  Stack:    ${STACK_NAME}"
echo "══════════════════════════════════════════════════════════"

# ── Step 1: ECR ────────────────────────────────────────────────
echo -e "\n▶ Step 1/6: ECR repository..."
aws ecr describe-repositories --repository-names "${ECR_REPO}" --region "${REGION}" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "${ECR_REPO}" --region "${REGION}" --output text >/dev/null

aws ecr get-login-password --region "${REGION}" \
  | finch login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com" 2>/dev/null

# ── Step 2: Build & push container ─────────────────────────────
echo -e "\n▶ Step 2/6: Building agent container (ARM64)..."
finch build --platform linux/arm64 \
  -t "${ECR_URI}:latest" "${SCRIPT_DIR}/agent"
finch push "${ECR_URI}:latest"

# ── Step 3: AgentCore execution role + runtime ─────────────────
echo -e "\n▶ Step 3/6: AgentCore Runtime..."
ROLE_NAME="${STACK_NAME}-AgentCoreRole"

ROLE_ARN=$(aws iam get-role --role-name "${ROLE_NAME}" --query 'Role.Arn' --output text 2>/dev/null || echo "")
if [ -z "${ROLE_ARN}" ] || [ "${ROLE_ARN}" = "None" ]; then
  ROLE_ARN=$(aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --assume-role-policy-document "{
      \"Version\":\"2012-10-17\",
      \"Statement\":[{
        \"Effect\":\"Allow\",
        \"Principal\":{\"Service\":\"bedrock-agentcore.amazonaws.com\"},
        \"Action\":\"sts:AssumeRole\",
        \"Condition\":{
          \"StringEquals\":{\"aws:SourceAccount\":\"${ACCOUNT_ID}\"},
          \"ArnLike\":{\"aws:SourceArn\":\"arn:aws:bedrock-agentcore:${REGION}:${ACCOUNT_ID}:*\"}
        }
      }]
    }" --query 'Role.Arn' --output text)
  echo "  Created role: ${ROLE_ARN}"
else
  echo "  Role exists: ${ROLE_ARN}"
fi

aws iam put-role-policy --role-name "${ROLE_NAME}" \
  --policy-name AgentCorePolicy \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[
      {\"Effect\":\"Allow\",\"Action\":[\"ecr:BatchGetImage\",\"ecr:GetDownloadUrlForLayer\"],\"Resource\":\"arn:aws:ecr:${REGION}:${ACCOUNT_ID}:repository/${ECR_REPO}\"},
      {\"Effect\":\"Allow\",\"Action\":\"ecr:GetAuthorizationToken\",\"Resource\":\"*\"},
      {\"Effect\":\"Allow\",\"Action\":[\"logs:CreateLogGroup\",\"logs:DescribeLogStreams\"],\"Resource\":\"arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/aws/bedrock-agentcore/runtimes/*\"},
      {\"Effect\":\"Allow\",\"Action\":\"logs:DescribeLogGroups\",\"Resource\":\"arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:*\"},
      {\"Effect\":\"Allow\",\"Action\":[\"logs:CreateLogStream\",\"logs:PutLogEvents\"],\"Resource\":\"arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*\"},
      {\"Effect\":\"Allow\",\"Action\":[\"xray:PutTraceSegments\",\"xray:PutTelemetryRecords\",\"xray:GetSamplingRules\",\"xray:GetSamplingTargets\"],\"Resource\":\"*\"},
      {\"Effect\":\"Allow\",\"Action\":\"cloudwatch:PutMetricData\",\"Resource\":\"*\",\"Condition\":{\"StringEquals\":{\"cloudwatch:namespace\":\"bedrock-agentcore\"}}},
      {\"Effect\":\"Allow\",\"Action\":[\"bedrock:InvokeModel\",\"bedrock:InvokeModelWithResponseStream\"],\"Resource\":[\"arn:aws:bedrock:*::foundation-model/*\",\"arn:aws:bedrock:${REGION}:${ACCOUNT_ID}:*\"]},
      {\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\"],\"Resource\":\"arn:aws:s3:::${STACK_NAME}-uploads-${ACCOUNT_ID}/*\"}
    ]
  }"

sleep 10

AGENT_ARN=""
RUNTIMES=$(aws bedrock-agentcore-control list-agent-runtimes --region "${REGION}" --query "agentRuntimes[?agentRuntimeName=='${AGENT_NAME}'].agentRuntimeArn" --output text 2>/dev/null || echo "")
if [ -n "${RUNTIMES}" ] && [ "${RUNTIMES}" != "None" ]; then
  AGENT_ARN="${RUNTIMES}"
  echo "  Runtime exists: ${AGENT_ARN}"
else
  AGENT_ARN=$(aws bedrock-agentcore-control create-agent-runtime \
    --agent-runtime-name "${AGENT_NAME}" \
    --agent-runtime-artifact "{\"containerConfiguration\":{\"containerUri\":\"${ECR_URI}:latest\"}}" \
    --network-configuration '{"networkMode":"PUBLIC"}' \
    --role-arn "${ROLE_ARN}" \
    --region "${REGION}" \
    --query 'agentRuntimeArn' --output text)
  echo "  Created runtime: ${AGENT_ARN}"

  echo "  Waiting for READY status..."
  for i in $(seq 1 30); do
    STATUS=$(aws bedrock-agentcore-control list-agent-runtimes --region "${REGION}" \
      --query "agentRuntimes[?agentRuntimeArn=='${AGENT_ARN}'].status" --output text 2>/dev/null || echo "CREATING")
    printf "    [%02d/30] %s\n" "$i" "${STATUS}"
    [ "${STATUS}" = "READY" ] && break
    sleep 10
  done
fi

ENCODED_ARN=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${AGENT_ARN}', safe=''))")
AGENT_ENDPOINT="https://bedrock-agentcore.${REGION}.amazonaws.com/runtimes/${ENCODED_ARN}/invocations"

# ── Step 4: SAM deploy ─────────────────────────────────────────
echo -e "\n▶ Step 4/6: Deploying SAM stack..."
cd "${SCRIPT_DIR}"
sam build --use-container 2>/dev/null || sam build
sam deploy \
  --stack-name "${STACK_NAME}" \
  --region "${REGION}" \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    "ParameterKey=AgentCoreEndpoint,ParameterValue=${AGENT_ENDPOINT}" \
    "ParameterKey=AgentName,ParameterValue=${AGENT_NAME}" \
  --no-confirm-changeset

# ── Step 5: Configure JWT authorizer ──────────────────────────
echo -e "\n▶ Step 5/6: Configuring JWT authorizer..."

get_output() {
  aws cloudformation describe-stacks --stack-name "${STACK_NAME}" --region "${REGION}" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

POOL_ID=$(get_output CognitoUserPoolId)
CLIENT_ID=$(get_output CognitoAppClientId)
TOKEN_ENDPOINT=$(get_output CognitoTokenEndpoint)
DISCOVERY_URL="https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}/.well-known/openid-configuration"

RUNTIME_ID=$(echo "${AGENT_ARN}" | grep -oP '[^/]+$')

aws bedrock-agentcore-control update-agent-runtime \
  --agent-runtime-id "${RUNTIME_ID}" \
  --agent-runtime-artifact "{\"containerConfiguration\":{\"containerUri\":\"${ECR_URI}:latest\"}}" \
  --role-arn "${ROLE_ARN}" \
  --network-configuration '{"networkMode":"PUBLIC"}' \
  --authorizer-configuration "{
    \"customJWTAuthorizer\": {
      \"discoveryUrl\": \"${DISCOVERY_URL}\",
      \"allowedClients\": [\"${CLIENT_ID}\"],
      \"allowedScopes\": [\"${AGENT_NAME}/invoke\"]
    }
  }" \
  --region "${REGION}" --query 'status' --output text

echo "  Waiting for READY..."
for i in $(seq 1 20); do
  STATUS=$(aws bedrock-agentcore-control list-agent-runtimes --region "${REGION}" \
    --query "agentRuntimes[?agentRuntimeArn=='${AGENT_ARN}'].status" --output text)
  [ "${STATUS}" = "READY" ] && echo "  READY" && break
  sleep 10
done

# ── Step 6: Connection + API Destination + Rule ────────────────
echo -e "\n▶ Step 6/6: Creating Connection, API Destination, and Rule..."

CLIENT_SECRET=$(aws cognito-idp describe-user-pool-client \
  --user-pool-id "${POOL_ID}" --client-id "${CLIENT_ID}" --region "${REGION}" \
  --query 'UserPoolClient.ClientSecret' --output text)

CONNECTION_NAME="${STACK_NAME}-connection"
DEST_NAME="${STACK_NAME}-dest"
RULE_NAME="${STACK_NAME}-rule"
BUCKET_NAME="${STACK_NAME}-uploads-${ACCOUNT_ID}"

# Connection
aws events create-connection \
  --name "${CONNECTION_NAME}" \
  --authorization-type OAUTH_CLIENT_CREDENTIALS \
  --auth-parameters "{
    \"OAuthParameters\": {
      \"AuthorizationEndpoint\": \"${TOKEN_ENDPOINT}\",
      \"HttpMethod\": \"POST\",
      \"ClientParameters\": {
        \"ClientID\": \"${CLIENT_ID}\",
        \"ClientSecret\": \"${CLIENT_SECRET}\"
      },
      \"OAuthHttpParameters\": {
        \"BodyParameters\": [
          {\"Key\": \"grant_type\", \"Value\": \"client_credentials\", \"IsValueSecret\": false},
          {\"Key\": \"scope\", \"Value\": \"${AGENT_NAME}/invoke\", \"IsValueSecret\": false}
        ]
      }
    }
  }" --region "${REGION}" 2>/dev/null \
|| aws events update-connection \
  --name "${CONNECTION_NAME}" \
  --authorization-type OAUTH_CLIENT_CREDENTIALS \
  --auth-parameters "{
    \"OAuthParameters\": {
      \"AuthorizationEndpoint\": \"${TOKEN_ENDPOINT}\",
      \"HttpMethod\": \"POST\",
      \"ClientParameters\": {
        \"ClientID\": \"${CLIENT_ID}\",
        \"ClientSecret\": \"${CLIENT_SECRET}\"
      },
      \"OAuthHttpParameters\": {
        \"BodyParameters\": [
          {\"Key\": \"grant_type\", \"Value\": \"client_credentials\", \"IsValueSecret\": false},
          {\"Key\": \"scope\", \"Value\": \"${AGENT_NAME}/invoke\", \"IsValueSecret\": false}
        ]
      }
    }
  }" --region "${REGION}"

CONNECTION_ARN=$(aws events describe-connection --name "${CONNECTION_NAME}" --region "${REGION}" \
  --query 'ConnectionArn' --output text)

# API Destination
aws events create-api-destination \
  --name "${DEST_NAME}" \
  --connection-arn "${CONNECTION_ARN}" \
  --invocation-endpoint "${AGENT_ENDPOINT}" \
  --http-method POST \
  --invocation-rate-limit-per-second 10 \
  --region "${REGION}" 2>/dev/null \
|| aws events update-api-destination \
  --name "${DEST_NAME}" \
  --connection-arn "${CONNECTION_ARN}" \
  --invocation-endpoint "${AGENT_ENDPOINT}" \
  --http-method POST \
  --invocation-rate-limit-per-second 10 \
  --region "${REGION}"

DEST_ARN=$(aws events describe-api-destination --name "${DEST_NAME}" --region "${REGION}" \
  --query 'ApiDestinationArn' --output text)

# IAM role for EventBridge -> API Destination
EB_ROLE_NAME="${STACK_NAME}-EBApiDestRole"
EB_ROLE_ARN=$(aws iam get-role --role-name "${EB_ROLE_NAME}" --query 'Role.Arn' --output text 2>/dev/null || echo "")
if [ -z "${EB_ROLE_ARN}" ] || [ "${EB_ROLE_ARN}" = "None" ]; then
  EB_ROLE_ARN=$(aws iam create-role \
    --role-name "${EB_ROLE_NAME}" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"events.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }' --query 'Role.Arn' --output text)
fi
aws iam put-role-policy --role-name "${EB_ROLE_NAME}" \
  --policy-name InvokeApiDest \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"events:InvokeApiDestination\",\"Resource\":\"${DEST_ARN}\"}]}"
sleep 5

DLQ_ARN="arn:aws:sqs:${REGION}:${ACCOUNT_ID}:${STACK_NAME}-dlq"

# Rule: match S3 Object Created events for regulatory report file types
aws events put-rule \
  --name "${RULE_NAME}" \
  --event-pattern "{
    \"source\": [\"aws.s3\"],
    \"detail-type\": [\"Object Created\"],
    \"detail\": {
      \"bucket\": {\"name\": [\"${BUCKET_NAME}\"]},
      \"object\": {\"key\": [{\"suffix\": \".txt\"}, {\"suffix\": \".md\"}, {\"suffix\": \".pdf\"}, {\"suffix\": \".docx\"}, {\"suffix\": \".json\"}]}
    }
  }" \
  --state ENABLED --region "${REGION}" >/dev/null

aws events put-targets \
  --rule "${RULE_NAME}" \
  --targets "[{
    \"Id\": \"AgentCoreTarget\",
    \"Arn\": \"${DEST_ARN}\",
    \"RoleArn\": \"${EB_ROLE_ARN}\",
    \"InputTransformer\": {
      \"InputPathsMap\": {\"bucket\": \"$.detail.bucket.name\", \"key\": \"$.detail.object.key\"},
      \"InputTemplate\": \"{\\\"prompt\\\": \\\"A regulatory report was uploaded for review. Read the file from bucket <bucket> with key <key> using the read_s3_file tool, then perform a full compliance review.\\\"}\"
    },
    \"DeadLetterConfig\": {\"Arn\": \"${DLQ_ARN}\"}
  }]" --region "${REGION}" >/dev/null

# ── Done ──────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  ✅ Deployment complete!"
echo ""
echo "  AgentCore ARN:  ${AGENT_ARN}"
echo "  S3 Bucket:      ${BUCKET_NAME}"
echo "  Connection:     ${CONNECTION_NAME}"
echo "  API Dest:       ${DEST_NAME}"
echo ""
echo "  Test:"
echo "    aws s3 cp 'test event/sample_sar.txt' s3://${BUCKET_NAME}/reports/sample_sar.txt"
echo "══════════════════════════════════════════════════════════"
