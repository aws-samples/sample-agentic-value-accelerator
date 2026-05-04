#!/bin/bash

# update-frontend-env.sh
# Updates frontend .env.local with latest Terraform outputs
# Use this after AgentCore Runtime redeployment to get the new endpoint

set -e  # Exit on error

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Change to repository root (parent of scripts directory)
cd "$SCRIPT_DIR/.."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
TERRAFORM_FOUNDATIONS_DIR="infrastructure/foundations"
TERRAFORM_APP_INFRA_DIR="infrastructure/app-infra"
FRONTEND_DIR="trade-alerts-app"

# Function to print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_info "Updating frontend environment variables from Terraform outputs..."

# Check if Terraform directories exist
if [ ! -d "$TERRAFORM_FOUNDATIONS_DIR" ]; then
    print_error "Terraform foundations directory '$TERRAFORM_FOUNDATIONS_DIR' not found"
    exit 1
fi

if [ ! -d "$TERRAFORM_APP_INFRA_DIR" ]; then
    print_error "Terraform app-infra directory '$TERRAFORM_APP_INFRA_DIR' not found"
    exit 1
fi

# Check if Terraform is installed
if ! command -v terraform &> /dev/null; then
    print_error "Terraform is not installed"
    exit 1
fi

# Check if frontend directory exists
if [ ! -d "$FRONTEND_DIR" ]; then
    print_error "Frontend directory '$FRONTEND_DIR' not found"
    exit 1
fi

# Query Terraform outputs
print_info "Retrieving Terraform outputs..."

USER_POOL_ID=$(terraform -chdir="$TERRAFORM_FOUNDATIONS_DIR" output -raw cognito_user_pool_id 2>&1)
if [[ "$USER_POOL_ID" == *"Warning"* ]] || [[ "$USER_POOL_ID" == *"Error"* ]]; then
    print_error "Failed to retrieve Cognito User Pool ID"
    exit 1
fi

CLIENT_ID=$(terraform -chdir="$TERRAFORM_FOUNDATIONS_DIR" output -raw cognito_web_app_client_id 2>&1)
if [[ "$CLIENT_ID" == *"Warning"* ]] || [[ "$CLIENT_ID" == *"Error"* ]]; then
    print_error "Failed to retrieve Cognito Client ID"
    exit 1
fi

API_ENDPOINT=$(terraform -chdir="$TERRAFORM_APP_INFRA_DIR" output -raw api_gateway_endpoint 2>&1)
if [[ "$API_ENDPOINT" == *"Warning"* ]] || [[ "$API_ENDPOINT" == *"Error"* ]]; then
    print_error "Failed to retrieve API Gateway endpoint"
    exit 1
fi

AWS_REGION=$(terraform -chdir="$TERRAFORM_APP_INFRA_DIR" output -raw aws_region 2>&1)
if [[ "$AWS_REGION" == *"Warning"* ]] || [[ "$AWS_REGION" == *"Error"* ]]; then
    AWS_REGION="us-east-1"
fi

AGENTCORE_ENDPOINT=$(terraform -chdir="$TERRAFORM_APP_INFRA_DIR" output -raw agentcore_runtime_endpoint 2>&1)
if [[ "$AGENTCORE_ENDPOINT" == *"Warning"* ]] || [[ "$AGENTCORE_ENDPOINT" == *"Error"* ]]; then
    AGENTCORE_ENDPOINT=""
fi

CLOUDFRONT_DOMAIN=$(terraform -chdir="$TERRAFORM_FOUNDATIONS_DIR" output -raw cloudfront_domain 2>&1)
if [[ "$CLOUDFRONT_DOMAIN" == *"Warning"* ]] || [[ "$CLOUDFRONT_DOMAIN" == *"Error"* ]]; then
    CLOUDFRONT_DOMAIN=""
fi

# Display retrieved values
echo ""
echo "=========================================="
echo "      RETRIEVED VALUES"
echo "=========================================="
echo "AWS Region:         $AWS_REGION"
echo "User Pool ID:       $USER_POOL_ID"
echo "Client ID:          $CLIENT_ID"
echo "API Endpoint:       $API_ENDPOINT"
if [ -n "$AGENTCORE_ENDPOINT" ]; then
    echo "AgentCore Endpoint: $AGENTCORE_ENDPOINT"
fi
if [ -n "$CLOUDFRONT_DOMAIN" ]; then
    echo "CloudFront Domain:  $CLOUDFRONT_DOMAIN"
fi
echo "=========================================="
echo ""

# Generate .env.local file
ENV_FILE="$FRONTEND_DIR/.env.local"

print_info "Updating $ENV_FILE..."

cat > "$ENV_FILE" << EOF
# AWS Configuration
NEXT_PUBLIC_AWS_REGION=$AWS_REGION

# Cognito Authentication
NEXT_PUBLIC_COGNITO_USER_POOL_ID=$USER_POOL_ID
NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=$CLIENT_ID

# API Configuration
NEXT_PUBLIC_API_ENDPOINT=$API_ENDPOINT
EOF

# Add optional AgentCore endpoint if available (server-side only)
if [ -n "$AGENTCORE_ENDPOINT" ]; then
    echo "" >> "$ENV_FILE"
    echo "# AgentCore Configuration (Server-side only - no NEXT_PUBLIC prefix)" >> "$ENV_FILE"
    echo "AGENTCORE_ENDPOINT=$AGENTCORE_ENDPOINT" >> "$ENV_FILE"
fi

# Add optional CloudFront domain if available
if [ -n "$CLOUDFRONT_DOMAIN" ]; then
    echo "" >> "$ENV_FILE"
    echo "# CloudFront" >> "$ENV_FILE"
    echo "NEXT_PUBLIC_CLOUDFRONT_DOMAIN=$CLOUDFRONT_DOMAIN" >> "$ENV_FILE"
fi

print_info "Environment file updated successfully"

echo ""
echo "=========================================="
echo "      UPDATE COMPLETE"
echo "=========================================="
echo "Updated variables in $ENV_FILE:"
echo "  NEXT_PUBLIC_AWS_REGION=$AWS_REGION"
echo "  NEXT_PUBLIC_COGNITO_USER_POOL_ID=$USER_POOL_ID"
echo "  NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=$CLIENT_ID"
echo "  NEXT_PUBLIC_API_ENDPOINT=$API_ENDPOINT"
if [ -n "$AGENTCORE_ENDPOINT" ]; then
    echo "  AGENTCORE_ENDPOINT=$AGENTCORE_ENDPOINT"
fi
if [ -n "$CLOUDFRONT_DOMAIN" ]; then
    echo "  NEXT_PUBLIC_CLOUDFRONT_DOMAIN=$CLOUDFRONT_DOMAIN"
fi
echo "=========================================="
echo ""

print_info "Next steps:"
echo "  1. If running locally: Restart your Next.js dev server"
echo "  2. If deploying: Run ./deploy-frontend.sh --auto"

exit 0
