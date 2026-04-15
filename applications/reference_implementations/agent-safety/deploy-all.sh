#!/bin/bash
# ============================================================
# Agent Safety Controls — Full Stack Deployment
# ============================================================
# Deploys everything in one command:
#   1. Dashboard (ECR + Docker + App Runner + Cognito + DynamoDB)
#   2. Cost Controls (SNS + EventBridge + Lambdas + boto3 layer)
#   3. Sample Agent (Inference Profile + S3 + AgentCore Runtime)
#
# Usage:
#   ./deploy-all.sh --profile mbavadiy-Admin --region us-east-2 \
#     --admin-email user@company.com --admin-password 'MyPass123'
#
# Optional:
#   --agent-name my_agent       Agent name (default: safety_demo_agent)
#   --skip-agent                Skip agent deployment
#   --skip-dashboard            Skip dashboard deployment
#   --skip-cost-controls        Skip cost controls deployment
# ============================================================
set -euo pipefail

REGION="us-east-1"
PROFILE=""
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
AGENT_NAME="safety_demo_agent"
SKIP_DASHBOARD=false
SKIP_COST=false
SKIP_AGENT=false

DASHBOARD_STACK="agent-safety-dashboard"
COST_STACK="agent-safety-cost-controls"

while [[ $# -gt 0 ]]; do
  case $1 in
    --region) REGION="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    --agent-name) AGENT_NAME="$2"; shift 2 ;;
    --skip-dashboard) SKIP_DASHBOARD=true; shift ;;
    --skip-cost-controls) SKIP_COST=true; shift ;;
    --skip-agent) SKIP_AGENT=true; shift ;;
    -h|--help)
      echo "Usage: ./deploy-all.sh --admin-email <email> [options]"
      echo ""
      echo "Required:"
      echo "  --admin-email <email>     Admin user email for dashboard login"
      echo ""
      echo "Optional:"
      echo "  --profile <name>          AWS CLI profile (uses default credentials if not set)"
      echo ""
      echo "Optional:"
      echo "  --admin-password <pass>   Admin password (prompted if not set)"
      echo "  --region <region>         AWS region (default: us-east-1)"
      echo "  --agent-name <name>       Sample agent name (default: safety_demo_agent)"
      echo "  --skip-dashboard          Skip dashboard deployment"
      echo "  --skip-cost-controls      Skip cost controls deployment"
      echo "  --skip-agent              Skip sample agent deployment"
      exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Validate required args
if [ "$SKIP_DASHBOARD" = false ] && [ -z "$ADMIN_EMAIL" ]; then
  echo "❌ --admin-email is required (or use --skip-dashboard)"; exit 1
fi
if [ "$SKIP_DASHBOARD" = false ] && [ -z "$ADMIN_PASSWORD" ]; then
  echo -n "Enter admin password for $ADMIN_EMAIL: "
  read -s ADMIN_PASSWORD; echo ""
  if [ -z "$ADMIN_PASSWORD" ]; then echo "❌ Password cannot be empty"; exit 1; fi
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_DIR="$SCRIPT_DIR/dashboard"
COST_DIR="$SCRIPT_DIR/cost-controls"
AGENT_DIR="$SCRIPT_DIR/sample-agent"

# Build profile flag — only pass --profile when set
PROFILE_FLAG=""
if [ -n "$PROFILE" ]; then
  PROFILE_FLAG="$PROFILE_FLAG"
fi

# Table names (consistent across all stacks)
REG_TABLE="safety-dashboard-registry"
SESS_TABLE="safety-dashboard-sessions"
INT_TABLE="safety-dashboard-interventions"
COST_TABLE="safety-dashboard-cost-signals"
OBS_TABLE="safety-dashboard-obs-signals"
EVAL_TABLE="safety-dashboard-eval-signals"

echo ""
echo "============================================================"
echo "  🛡️  Agent Safety Controls — Full Stack Deploy"
echo "============================================================"
echo "  Region:       $REGION"
echo "  Profile:      $PROFILE"
echo "  Dashboard:    $([ "$SKIP_DASHBOARD" = true ] && echo 'SKIP' || echo $DASHBOARD_STACK)"
echo "  Cost Controls:$([ "$SKIP_COST" = true ] && echo 'SKIP' || echo $COST_STACK)"
echo "  Agent:        $([ "$SKIP_AGENT" = true ] && echo 'SKIP' || echo $AGENT_NAME)"
echo "============================================================"
echo ""

START_TIME=$(date +%s)

# ============================================================
# PHASE 1: Dashboard (ECR + Docker + App Runner + Cognito + DynamoDB)
# ============================================================
if [ "$SKIP_DASHBOARD" = false ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  📊 Phase 1: Dashboard"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if [ ! -f "$DASHBOARD_DIR/deploy.sh" ]; then
    echo "❌ Dashboard deploy script not found at $DASHBOARD_DIR/deploy.sh"
    exit 1
  fi
  bash "$DASHBOARD_DIR/deploy.sh" \
    $PROFILE_FLAG \
    --region "$REGION" \
    --admin-email "$ADMIN_EMAIL" \
    --admin-password "$ADMIN_PASSWORD" \
    --stack-name "$DASHBOARD_STACK"
  echo ""
  echo "  ✅ Dashboard deployed"
  echo ""
else
  echo "⏭️  Skipping dashboard deployment"
fi

# ============================================================
# PHASE 2: Cost Controls (SNS + EventBridge + Lambdas + Layer)
# ============================================================
if [ "$SKIP_COST" = false ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  💰 Phase 2: Cost Controls"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if [ ! -f "$COST_DIR/deploy.sh" ]; then
    echo "❌ Cost controls deploy script not found at $COST_DIR/deploy.sh"
    exit 1
  fi
  bash "$COST_DIR/deploy.sh" \
    $PROFILE_FLAG \
    --region "$REGION" \
    --stack-name "$COST_STACK" \
    --cost-signals-table "$COST_TABLE" \
    --registry-table "$REG_TABLE" \
    --session-table "$SESS_TABLE" \
    --intervention-table "$INT_TABLE"
  echo ""
  echo "  ✅ Cost controls deployed"
  echo ""
else
  echo "⏭️  Skipping cost controls deployment"
fi

# ============================================================
# PHASE 2b: Evaluation Controls (Eval Lambda + Alarms + EventBridge)
# ============================================================
if [ "$SKIP_COST" = false ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  🧪 Phase 2b: Evaluation Controls"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  EVAL_DIR="$SCRIPT_DIR/evaluation-controls"
  if [ -f "$EVAL_DIR/deploy.sh" ]; then
    bash "$EVAL_DIR/deploy.sh" \
      $PROFILE_FLAG \
      --region "$REGION" \
      --eval-signals-table "$EVAL_TABLE" \
      --registry-table "$REG_TABLE"
    echo ""
    echo "  ✅ Evaluation controls deployed"
  else
    echo "  ⏭️  Evaluation controls not found — skipping"
  fi
  echo ""
else
  echo "⏭️  Skipping evaluation controls deployment"
fi

# ============================================================
# PHASE 3: Sample Agent (Inference Profile + S3 + AgentCore)
# ============================================================
if [ "$SKIP_AGENT" = false ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  🤖 Phase 3: Sample Agent"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if [ ! -f "$AGENT_DIR/deploy.py" ]; then
    echo "❌ Agent deploy script not found at $AGENT_DIR/deploy.py"
    exit 1
  fi
  # Find a Python with boto3
  PYTHON_CMD="python3"
  if [ -f "$SCRIPT_DIR/sample-agent/.venv/bin/python" ]; then
    PYTHON_CMD="$SCRIPT_DIR/sample-agent/.venv/bin/python"
  fi
  $PYTHON_CMD "$AGENT_DIR/deploy.py" \
    --name "$AGENT_NAME" \
    --region "$REGION" \
    $PROFILE_FLAG \
    --session-table "$SESS_TABLE"
  echo ""
  echo "  ✅ Agent deployed"
  echo ""
else
  echo "⏭️  Skipping agent deployment"
fi

# ============================================================
# SUMMARY
# ============================================================
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "============================================================"
echo "  🎉 Full Stack Deployment Complete! (${DURATION}s)"
echo "============================================================"
echo ""

# Show dashboard URL
if [ "$SKIP_DASHBOARD" = false ]; then
  DASHBOARD_URL=$(aws cloudformation describe-stacks \
    --stack-name "$DASHBOARD_STACK" \
    --region "$REGION" $PROFILE_FLAG \
    --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
    --output text 2>/dev/null) || true
  echo "  🌐 Dashboard:  ${DASHBOARD_URL:-'check CF outputs'}"
  echo "  🔑 Login:      $ADMIN_EMAIL"
fi

# Show agent ARN
if [ "$SKIP_AGENT" = false ]; then
  AGENT_STACK="agent-$(echo $AGENT_NAME | tr '_' '-')"
  AGENT_ARN=$(aws cloudformation describe-stacks \
    --stack-name "$AGENT_STACK" \
    --region "$REGION" $PROFILE_FLAG \
    --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeArn`].OutputValue' \
    --output text 2>/dev/null) || true
  echo "  🤖 Agent ARN:  ${AGENT_ARN:-'check CF outputs'}"
  echo ""
  echo "  To invoke the agent:"
  echo "    python3 invoke_agent.py --arn $AGENT_ARN --prompt 'Hello!' --region $REGION $PROFILE_FLAG"
fi

echo ""
echo "============================================================"
