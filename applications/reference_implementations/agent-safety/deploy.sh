#!/bin/bash
# ============================================================
# Agent Safety Controls — Full Stack Deployment
# ============================================================
# Deploys everything in one command:
#   1. Dashboard (ECR + Docker + ECS Express Mode + Cognito + DynamoDB)
#   2. Cost Controls (SNS + EventBridge + Lambdas + boto3 layer)
#   3. Evaluation Controls (Eval Lambda + Alarms + EventBridge)
#   4. Kill Switch (Kill Switch Lambda)
#   5. Observability Controls (Auto Alarms Lambda + EventBridge)
#   6. Sample Agent (Inference Profile + S3 + AgentCore Runtime)
#
# Usage:
#   ./deploy-all.sh --profile my-admin --region us-east-1
#
# Optional:
#   --admin-email <email>       Admin email (default: admin@agent-safety.local)
#   --admin-password <pass>     Admin password (default: AgentSafety123!)
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
      echo "Usage: ./deploy-all.sh [options]"
      echo ""
      echo "Optional:"
      echo "  --profile <name>          AWS CLI profile (uses default credentials if not set)"
      echo "  --admin-email <email>     Admin email (default: admin@agent-safety.local)"
      echo "  --admin-password <pass>   Admin password (default: AgentSafety123!)"
      echo "  --region <region>         AWS region (default: us-east-1)"
      echo "  --agent-name <name>       Sample agent name (default: safety_demo_agent)"
      echo "  --skip-dashboard          Skip dashboard deployment"
      echo "  --skip-cost-controls      Skip cost controls deployment"
      echo "  --skip-agent              Skip sample agent deployment"
      exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Set defaults for workshop-friendly deployment
if [ -z "$ADMIN_EMAIL" ]; then
  ADMIN_EMAIL="admin@agent-safety.local"
fi
if [ -z "$ADMIN_PASSWORD" ]; then
  ADMIN_PASSWORD="AgentSafety123!"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_DIR="$SCRIPT_DIR/dashboard"
COST_DIR="$SCRIPT_DIR/cost-controls"
AGENT_DIR="$SCRIPT_DIR/sample-agent"

# Build profile flag — only pass --profile when set
PROFILE_FLAG=""
if [ -n "$PROFILE" ]; then
  PROFILE_FLAG="--profile $PROFILE"
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
# PHASE 1: Dashboard (ECR + Docker + ECS Express Mode + Cognito + DynamoDB)
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
    --intervention-table "$INT_TABLE" \
    --notification-email "$ADMIN_EMAIL"
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
# PHASE 2c: Kill Switch (Kill Switch Lambda)
# ============================================================
if [ "$SKIP_COST" = false ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  🔴 Phase 2c: Kill Switch"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  KILL_DIR="$SCRIPT_DIR/kill-switch"
  if [ -f "$KILL_DIR/deploy.sh" ]; then
    bash "$KILL_DIR/deploy.sh" \
      $PROFILE_FLAG \
      --region "$REGION" \
      --registry-table "$REG_TABLE" \
      --intervention-table "$INT_TABLE" \
      --cost-signals-table "$COST_TABLE" \
      --obs-signals-table "$OBS_TABLE" \
      --eval-signals-table "$EVAL_TABLE"
    echo ""
    echo "  ✅ Kill switch deployed"
  else
    echo "  ⏭️  Kill switch not found — skipping"
  fi
  echo ""
else
  echo "⏭️  Skipping kill switch deployment"
fi

# ============================================================
# PHASE 2d: Observability Controls (Auto Alarms Lambda + EventBridge)
# ============================================================
if [ "$SKIP_COST" = false ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  📡 Phase 2d: Observability Controls"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  OBS_DIR="$SCRIPT_DIR/observability-controls"
  if [ -f "$OBS_DIR/deploy.sh" ]; then
    bash "$OBS_DIR/deploy.sh" \
      $PROFILE_FLAG \
      --region "$REGION" \
      --obs-signals-table "$OBS_TABLE" \
      --registry-table "$REG_TABLE"
    echo ""
    echo "  ✅ Observability controls deployed"
  else
    echo "  ⏭️  Observability controls not found — skipping"
  fi
  echo ""
else
  echo "⏭️  Skipping observability controls deployment"
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
  # sample-agent/deploy.py cross-compiles deps for Linux ARM64 via `uv`.
  # CodeBuild images don't ship uv, so install it idempotently on PATH.
  if ! command -v uv >/dev/null 2>&1; then
    echo "   Installing uv (required for ARM64 cross-platform packaging)..."
    if command -v pip3 >/dev/null 2>&1; then
      pip3 install --quiet --user uv 2>/dev/null || pip3 install --quiet uv
      export PATH="$HOME/.local/bin:$PATH"
    else
      curl -LsSf https://astral.sh/uv/install.sh | sh
      export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
    fi
  fi
  # Find a Python with boto3
  PYTHON_CMD="python3"
  if [ -f "$SCRIPT_DIR/.venv/bin/python" ]; then
    PYTHON_CMD="$SCRIPT_DIR/.venv/bin/python"
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
  echo "  🔑 Login:      $ADMIN_EMAIL / $ADMIN_PASSWORD"
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

# ============================================================
# Pipeline outputs — writes /tmp/outputs.json so the control-plane
# buildspec can surface "Open App" and the admin Cognito pool id on
# the Deployment Detail page. No-op when the file system isn't
# writable (e.g. sandboxed local dry runs).
# ============================================================
COGNITO_POOL=""
if [ "$SKIP_DASHBOARD" = false ]; then
  COGNITO_POOL=$(aws cloudformation describe-stacks \
    --stack-name "$DASHBOARD_STACK" \
    --region "$REGION" $PROFILE_FLAG \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue | [0]" \
    --output text 2>/dev/null || echo "")
fi
cat > /tmp/outputs.json 2>/dev/null <<JSON || true
{
  "ui_url":               "${DASHBOARD_URL:-}",
  "admin_email":          "${ADMIN_EMAIL:-}",
  "admin_password":       "${ADMIN_PASSWORD:-}",
  "cognito_user_pool_id": "${COGNITO_POOL:-}",
  "agent_arn":            "${AGENT_ARN:-}",
  "region":               "${REGION}"
}
JSON
[ -f /tmp/outputs.json ] && echo "  📤 Outputs written to /tmp/outputs.json" || true
