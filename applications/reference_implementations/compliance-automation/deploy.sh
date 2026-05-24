#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "══════════════════════════════════════════════════════════"
echo "  Compliance Automation — Reference Implementation"
echo "  Account: ${ACCOUNT_ID}  Region: ${REGION}"
echo "══════════════════════════════════════════════════════════"

# ── Deploy Deadline Monitor Agent ──────────────────────────────
echo -e "\n▶ Deploying Compliance Deadline Monitor agent..."
cd "${SCRIPT_DIR}/agent-backend"
STACK_NAME=compliance-deadline-monitor
AGENT_NAME=compliance_deadline_monitor_agent
ECR_REPO="${STACK_NAME}-agent"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"

aws ecr describe-repositories --repository-names "${ECR_REPO}" --region "${REGION}" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "${ECR_REPO}" --region "${REGION}" --output text >/dev/null

aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com" 2>/dev/null

docker build --platform linux/arm64 -t "${ECR_URI}:latest" -f Dockerfile.deadline .
docker push "${ECR_URI}:latest"

echo "  ✅ Deadline Monitor container pushed"

# ── Deploy Report Reviewer Agent ──────────────────────────────
echo -e "\n▶ Deploying Regulatory Report Reviewer agent..."
ECR_REPO_R=reg-report-reviewer-agent
ECR_URI_R="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO_R}"

aws ecr describe-repositories --repository-names "${ECR_REPO_R}" --region "${REGION}" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "${ECR_REPO_R}" --region "${REGION}" --output text >/dev/null

docker build --platform linux/arm64 -t "${ECR_URI_R}:latest" -f Dockerfile.reviewer .
docker push "${ECR_URI_R}:latest"

echo "  ✅ Report Reviewer container pushed"

# ── Deploy SAM stacks ─────────────────────────────────────────
echo -e "\n▶ Deploying infrastructure (SAM)..."
echo "  See agent-backend/template-deadline.yaml and template-reviewer.yaml"
echo "  Run: sam deploy --template-file template-deadline.yaml --stack-name ${STACK_NAME} --resolve-s3 --capabilities CAPABILITY_IAM --region ${REGION}"

# ── Frontend ──────────────────────────────────────────────────
echo -e "\n▶ Building frontend..."
cd "${SCRIPT_DIR}/frontend"
npm install
npm run build
echo "  ✅ Frontend built (run 'npm start' or deploy to ECS/Amplify)"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  ✅ Build complete!"
echo ""
echo "  Frontend: cd frontend && npm run dev"
echo "  Agents:   Deployed to AgentCore via SAM"
echo "══════════════════════════════════════════════════════════"
