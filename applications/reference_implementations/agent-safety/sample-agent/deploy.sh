#!/bin/bash
# ============================================================
# Agent Safety — AgentCore Agent Deployment
# ============================================================
# One-command deployment of AgentCore agents with safety controls.
# Handles inference profiles, memory, session tracking, and cost tags.
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "🛡️  Agent Safety — AgentCore Deployment"
echo "=========================================="
echo ""

# --- Check prerequisites ---
if ! command -v python3 &> /dev/null; then
    echo "❌ python3 is required. Please install Python 3.11+ and try again."
    exit 1
fi

if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is required. Please install it and try again."
    echo "   https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
fi

if ! command -v uv &> /dev/null; then
    echo "❌ 'uv' is required for packaging agent dependencies."
    echo "   Install: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

if ! python3 -c "import boto3" 2>/dev/null; then
    echo "❌ boto3 Python package is required. Please install it:"
    echo "   pip3 install boto3"
    exit 1
fi

# --- Gather parameters ---
echo "📋 Configuration"
echo ""

read -p "Agent name (alphanumeric + underscores): " AGENT_NAME
if [ -z "$AGENT_NAME" ]; then
    echo "❌ Agent name is required."
    exit 1
fi

echo ""
echo "Available models:"
echo "  1. Claude Sonnet 4 (us.anthropic.claude-sonnet-4-20250514-v1:0)"
echo "  2. Claude 3.7 Sonnet (us.anthropic.claude-3-7-sonnet-20250219-v1:0)"
echo "  3. Claude 3.5 Sonnet v2 (us.anthropic.claude-3-5-sonnet-20241022-v2:0)"
echo "  4. Custom model ID"
read -p "Choice [1]: " MODEL_CHOICE
MODEL_CHOICE=${MODEL_CHOICE:-1}

case $MODEL_CHOICE in
    1) MODEL_ID="us.anthropic.claude-sonnet-4-20250514-v1:0" ;;
    2) MODEL_ID="us.anthropic.claude-3-7-sonnet-20250219-v1:0" ;;
    3) MODEL_ID="us.anthropic.claude-3-5-sonnet-20241022-v2:0" ;;
    4) read -p "Enter model ID: " MODEL_ID ;;
    *) MODEL_ID="us.anthropic.claude-sonnet-4-20250514-v1:0" ;;
esac

echo ""
echo "Memory Configuration:"
echo "  1. No memory (stateless agent with DynamoDB session tracking)"
echo "  2. Create new memory resource"
echo "  3. Use existing memory resource"
read -p "Choice [1]: " MEMORY_CHOICE
MEMORY_CHOICE=${MEMORY_CHOICE:-1}

MEMORY_FLAGS=""

if [ "$MEMORY_CHOICE" = "2" ]; then
    MEMORY_FLAGS="--create-memory"
elif [ "$MEMORY_CHOICE" = "3" ]; then
    read -p "Existing Memory ID: " EXISTING_MEMORY_ID
    if [ -z "$EXISTING_MEMORY_ID" ]; then
        echo "❌ Memory ID is required for option 3."
        exit 1
    fi
    MEMORY_FLAGS="--existing-memory-id ${EXISTING_MEMORY_ID}"
fi

echo ""
read -p "AWS Region [us-east-1]: " AWS_REGION
AWS_REGION=${AWS_REGION:-us-east-1}

echo ""
echo "AWS Authentication:"
echo "  1. AWS CLI Profile (e.g., default, my-profile)"
echo "  2. Environment credentials (AWS_ACCESS_KEY_ID already set)"
echo "  3. Default (use current AWS CLI configuration)"
read -p "Choice [3]: " AUTH_CHOICE
AUTH_CHOICE=${AUTH_CHOICE:-3}

AWS_PROFILE_NAME=""
if [ "$AUTH_CHOICE" = "1" ]; then
    read -p "AWS Profile name: " AWS_PROFILE_NAME
    if [ -z "$AWS_PROFILE_NAME" ]; then
        echo "❌ Profile name is required for option 1."
        exit 1
    fi
elif [ "$AUTH_CHOICE" = "2" ]; then
    if [ -z "$AWS_ACCESS_KEY_ID" ]; then
        echo "❌ AWS_ACCESS_KEY_ID is not set. Export your credentials first:"
        echo "   export AWS_ACCESS_KEY_ID=..."
        echo "   export AWS_SECRET_ACCESS_KEY=..."
        exit 1
    fi
    echo "  Using environment credentials."
fi

echo ""
read -p "DynamoDB table for session tracking [session-token-usage]: " SESSION_TABLE
SESSION_TABLE=${SESSION_TABLE:-session-token-usage}

echo ""
read -p "Execution Role ARN (leave empty to auto-create): " ROLE_ARN

# --- Confirm ---
echo ""
echo "=========================================="
echo "  Agent:    $AGENT_NAME"
echo "  Model:    $MODEL_ID"
if [ "$MEMORY_CHOICE" = "1" ]; then
    echo "  Type:     Stateless (DynamoDB sessions)"
elif [ "$MEMORY_CHOICE" = "2" ]; then
    echo "  Type:     Memory-enabled (new memory)"
else
    echo "  Type:     Memory-enabled (existing: $EXISTING_MEMORY_ID)"
fi
echo "  Region:   $AWS_REGION"
echo "  Table:    $SESSION_TABLE"
echo "  Role:     ${ROLE_ARN:-auto-create}"
echo "=========================================="
echo ""
read -p "Proceed with deployment? (y/n) [y]: " CONFIRM
CONFIRM=${CONFIRM:-y}
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Cancelled."
    exit 0
fi

# --- Build deploy command ---
CMD="python3 ${SCRIPT_DIR}/deploy.py --name ${AGENT_NAME} --model-id ${MODEL_ID} --region ${AWS_REGION} --session-table ${SESSION_TABLE}"

if [ -n "$ROLE_ARN" ]; then
    CMD="$CMD --role-arn ${ROLE_ARN}"
fi

if [ -n "$MEMORY_FLAGS" ]; then
    CMD="$CMD ${MEMORY_FLAGS}"
fi

if [ -n "$AWS_PROFILE_NAME" ]; then
    CMD="$CMD --profile ${AWS_PROFILE_NAME}"
    export AWS_PROFILE="${AWS_PROFILE_NAME}"
fi

# --- Run deployment ---
echo ""
echo "🚀 Starting deployment..."
echo ""

eval $CMD

echo ""
echo "=========================================="
echo "✅ Deployment complete!"
echo ""
echo "To invoke your agent:"
echo "  python3 invoke_agent.py --arn <AGENT_ARN> --prompt 'Hello'"
echo ""
echo "To invoke with a specific session (multi-turn):"
echo "  python3 invoke_agent.py --arn <AGENT_ARN> --prompt 'Hello' --session-id <SESSION_ID>"
echo "=========================================="
