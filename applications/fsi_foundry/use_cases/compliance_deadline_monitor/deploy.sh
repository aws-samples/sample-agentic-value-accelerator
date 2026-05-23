#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────
STACK_NAME="${STACK_NAME:-compliance-deadline-monitor}"
AGENT_NAME="${AGENT_NAME:-compliance_deadline_monitor_agent}"
REGION="${AWS_REGION:-us-east-1}"
SCHEDULE_EXPR="${SCHEDULE_EXPR:-cron(0 11 * * ? *)}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="${STACK_NAME}-agent"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "══════════════════════════════════════════════════════════"
echo "  Compliance Deadline Monitor — Scheduled Agent Pattern"
echo "  Account:   ${ACCOUNT_ID}"
echo "  Region:    ${REGION}"
echo "  Stack:     ${STACK_NAME}"
echo "  Schedule:  ${SCHEDULE_EXPR}"
echo "══════════════════════════════════════════════════════════"

# ── Step 1: ECR ────────────────────────────────────────────────
echo -e "\n▶ Step 1/7: ECR repository..."
aws ecr describe-repositories --repository-names "${ECR_REPO}" --region "${REGION}" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "${ECR_REPO}" --region "${REGION}" --output text >/dev/null

aws ecr get-login-password --region "${REGION}" \
  | finch login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com" 2>/dev/null

# ── Step 2: Build & push container ─────────────────────────────
echo -e "\n▶ Step 2/7: Building agent container (ARM64)..."
finch build --platform linux/arm64 \
  -t "${ECR_URI}:latest" "${SCRIPT_DIR}/agent"
finch push "${ECR_URI}:latest"

# ── Step 3: AgentCore execution role ───────────────────────────
echo -e "\n▶ Step 3/7: AgentCore execution role..."
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
  echo "  Created: ${ROLE_ARN}"
else
  echo "  Exists: ${ROLE_ARN}"
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
      {\"Effect\":\"Allow\",\"Action\":[\"bedrock:InvokeModel\",\"bedrock:InvokeModelWithResponseStream\"],\"Resource\":[\"arn:aws:bedrock:*::foundation-model/*\",\"arn:aws:bedrock:${REGION}:${ACCOUNT_ID}:*\"]}
    ]
  }"

sleep 10

# ── Step 4: Create AgentCore Runtime ──────────────────────────
echo -e "\n▶ Step 4/7: AgentCore Runtime..."
AGENT_ARN=""
RUNTIMES=$(aws bedrock-agentcore-control list-agent-runtimes --region "${REGION}" --query "agentRuntimes[?agentRuntimeName=='${AGENT_NAME}'].agentRuntimeArn" --output text 2>/dev/null || echo "")
if [ -n "${RUNTIMES}" ] && [ "${RUNTIMES}" != "None" ]; then
  AGENT_ARN="${RUNTIMES}"
  echo "  Exists: ${AGENT_ARN}"
else
  AGENT_ARN=$(aws bedrock-agentcore-control create-agent-runtime \
    --agent-runtime-name "${AGENT_NAME}" \
    --agent-runtime-artifact "{\"containerConfiguration\":{\"containerUri\":\"${ECR_URI}:latest\"}}" \
    --network-configuration '{"networkMode":"PUBLIC"}' \
    --role-arn "${ROLE_ARN}" \
    --region "${REGION}" \
    --query 'agentRuntimeArn' --output text)
  echo "  Created: ${AGENT_ARN}"

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

# ── Step 5: SAM deploy ─────────────────────────────────────────
echo -e "\n▶ Step 5/7: Deploying SAM stack..."
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
    "ParameterKey=ScheduleExpression,ParameterValue='${SCHEDULE_EXPR}'" \
  --no-confirm-changeset

# ── Step 6: Connection + API Destination + Rule ────────────────
echo -e "\n▶ Step 6/7: Creating Connection, API Destination, and Rule..."

get_output() {
  aws cloudformation describe-stacks --stack-name "${STACK_NAME}" --region "${REGION}" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

POOL_ID=$(get_output CognitoUserPoolId)
CLIENT_ID=$(get_output CognitoAppClientId)
TOKEN_ENDPOINT=$(get_output CognitoTokenEndpoint)
EVENT_BUS_ARN=$(get_output EventBusArn)
EVENT_BUS_NAME="${STACK_NAME}-bus"

CLIENT_SECRET=$(aws cognito-idp describe-user-pool-client \
  --user-pool-id "${POOL_ID}" --client-id "${CLIENT_ID}" --region "${REGION}" \
  --query 'UserPoolClient.ClientSecret' --output text)

CONNECTION_NAME="${STACK_NAME}-connection"
DEST_NAME="${STACK_NAME}-dest"
RULE_NAME="${STACK_NAME}-rule"

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

# Rule on custom bus
aws events put-rule \
  --name "${RULE_NAME}" \
  --event-bus-name "${EVENT_BUS_NAME}" \
  --event-pattern '{"source":["scheduler.agentcore"],"detail-type":["ScheduledAgentInvocation"]}' \
  --state ENABLED --region "${REGION}" >/dev/null

aws events put-targets \
  --rule "${RULE_NAME}" \
  --event-bus-name "${EVENT_BUS_NAME}" \
  --targets "[{
    \"Id\": \"AgentCoreTarget\",
    \"Arn\": \"${DEST_ARN}\",
    \"RoleArn\": \"${EB_ROLE_ARN}\",
    \"InputTransformer\": {
      \"InputPathsMap\": {\"prompt\": \"$.detail.prompt\"},
      \"InputTemplate\": \"{\\\"prompt\\\": <prompt>}\"
    },
    \"DeadLetterConfig\": {\"Arn\": \"${DLQ_ARN}\"}
  }]" --region "${REGION}" >/dev/null

# ── Step 7: EventBridge Scheduler ──────────────────────────────
echo -e "\n▶ Step 7/7: Creating EventBridge Schedule..."

SCHEDULE_NAME="${STACK_NAME}-schedule"
SCHEDULER_ROLE_NAME="${STACK_NAME}-SchedulerRole"

SCHEDULER_ROLE_ARN=$(aws iam get-role --role-name "${SCHEDULER_ROLE_NAME}" --query 'Role.Arn' --output text 2>/dev/null || echo "")
if [ -z "${SCHEDULER_ROLE_ARN}" ] || [ "${SCHEDULER_ROLE_ARN}" = "None" ]; then
  SCHEDULER_ROLE_ARN=$(aws iam create-role \
    --role-name "${SCHEDULER_ROLE_NAME}" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"scheduler.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }' --query 'Role.Arn' --output text)
fi

aws iam put-role-policy --role-name "${SCHEDULER_ROLE_NAME}" \
  --policy-name SchedulerPutEvents \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{
      \"Effect\":\"Allow\",
      \"Action\":\"events:PutEvents\",
      \"Resource\":\"${EVENT_BUS_ARN}\"
    }]
  }"
sleep 5

SCHEDULE_INPUT="{\"prompt\": \"Run the daily compliance deadline check. Identify all at-risk filings and provide escalation recommendations.\"}"

aws scheduler create-schedule \
  --name "${SCHEDULE_NAME}" \
  --schedule-expression "${SCHEDULE_EXPR}" \
  --flexible-time-window '{"Mode":"OFF"}' \
  --target "{
    \"Arn\": \"${EVENT_BUS_ARN}\",
    \"RoleArn\": \"${SCHEDULER_ROLE_ARN}\",
    \"EventBridgeParameters\": {
      \"Source\": \"scheduler.agentcore\",
      \"DetailType\": \"ScheduledAgentInvocation\"
    },
    \"Input\": \"$(echo "${SCHEDULE_INPUT}" | sed 's/"/\\"/g')\"
  }" \
  --state ENABLED \
  --region "${REGION}" 2>/dev/null \
|| aws scheduler update-schedule \
  --name "${SCHEDULE_NAME}" \
  --schedule-expression "${SCHEDULE_EXPR}" \
  --flexible-time-window '{"Mode":"OFF"}' \
  --target "{
    \"Arn\": \"${EVENT_BUS_ARN}\",
    \"RoleArn\": \"${SCHEDULER_ROLE_ARN}\",
    \"EventBridgeParameters\": {
      \"Source\": \"scheduler.agentcore\",
      \"DetailType\": \"ScheduledAgentInvocation\"
    },
    \"Input\": \"$(echo "${SCHEDULE_INPUT}" | sed 's/"/\\"/g')\"
  }" \
  --state ENABLED \
  --region "${REGION}"

# ── Done ──────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  ✅ Deployment complete!"
echo ""
echo "  AgentCore ARN:  ${AGENT_ARN}"
echo "  Schedule:       ${SCHEDULE_NAME} (${SCHEDULE_EXPR})"
echo "  EventBus:       ${EVENT_BUS_NAME}"
echo ""
echo "  Test manually:"
echo "    aws events put-events --entries '[{\"EventBusName\":\"${EVENT_BUS_NAME}\",\"Source\":\"scheduler.agentcore\",\"DetailType\":\"ScheduledAgentInvocation\",\"Detail\":\"{\\\\\"prompt\\\\\":\\\\\"Run the daily compliance deadline check.\\\\\"}\"}]' --region ${REGION}"
echo ""
echo "  Manage schedule:"
echo "    aws scheduler get-schedule --name ${SCHEDULE_NAME} --region ${REGION}"
echo "══════════════════════════════════════════════════════════"
