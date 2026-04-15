#!/bin/bash

# ============================================================================
# AVA - UI Deployment Script for AgentCore
# ============================================================================
# Deploys the agent interaction UI for AgentCore deployments.
# Creates Lambda proxy, S3 bucket, CloudFront distribution, and uploads UI.
#
# This script:
# 1. Validates prerequisites (node, npm)
# 2. Deploys UI infrastructure via Terraform (Lambda, S3, CloudFront)
# 3. Generates runtime-config.json from registry + Terraform outputs
# 4. Builds the React UI
# 5. Uploads UI assets to S3
# 6. Invalidates CloudFront cache
#
# Usage:
#   Called from deploy_agentcore.sh or standalone:
#   USE_CASE_ID=credit_risk FRAMEWORK=langchain_langgraph AWS_REGION=us-east-1 \
#     AGENTCORE_RUNTIME_ARN=arn:... ./deploy_ui.sh
#
# Required Environment Variables:
#   USE_CASE_ID             - Use case identifier
#   FRAMEWORK               - AI framework
#   AWS_REGION              - Target AWS region
#   AGENTCORE_RUNTIME_ARN   - ARN of the deployed AgentCore runtime
#
# Optional:
#   AWS_PROFILE             - AWS CLI profile
# ============================================================================

set -e

# ============================================================================
# Script Initialization
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"

export DEPLOYMENT_PATTERN="${DEPLOYMENT_PATTERN:-agentcore}"

# ============================================================================
# Source Library Modules
# ============================================================================

source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/common.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/variables.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/docker.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/terraform.sh"

# ============================================================================
# Paths
# ============================================================================

UI_PATH="$PROJECT_ROOT/applications/fsi_foundry/ui/$USE_CASE_ID"
UI_TERRAFORM_PATH="$PROJECT_ROOT/applications/fsi_foundry/foundations/iac/agentcore/ui"
REGISTRY_FILE="$PROJECT_ROOT/applications/fsi_foundry/data/registry/offerings.json"

# ============================================================================
# Functions
# ============================================================================

check_ui_prerequisites() {
    local has_error=false

    if ! command -v node &> /dev/null; then
        error "Node.js is not installed"
        has_error=true
    fi

    if ! command -v npm &> /dev/null; then
        error "npm is not installed"
        has_error=true
    fi

    if [[ -z "$AGENTCORE_RUNTIME_ARN" ]]; then
        error "AGENTCORE_RUNTIME_ARN is not set"
        has_error=true
    fi

    if [[ "$has_error" == "true" ]]; then
        return 1
    fi

    return 0
}

deploy_ui_infrastructure() {
    pushd "$UI_TERRAFORM_PATH" > /dev/null

    if [[ ! -d ".terraform" ]]; then
        info "Initializing Terraform..."
        if ! terraform init; then
            error "Terraform initialization failed"
            popd > /dev/null
            return 1
        fi
    fi

    # Workspace: reuse the same naming convention
    local framework_short
    framework_short=$(get_framework_short_name "$FRAMEWORK")
    local workspace_name
    workspace_name=$(get_workspace_name "$USE_CASE_ID" "$framework_short" "$AWS_REGION")

    info "Selecting Terraform workspace: $workspace_name"
    if terraform workspace list 2>/dev/null | grep -q "^[* ]*${workspace_name}$"; then
        terraform workspace select "$workspace_name"
    else
        terraform workspace new "$workspace_name"
    fi

    local resource_id
    resource_id=$(normalize_use_case_to_id "$USE_CASE_ID")
    resource_id=$(echo "$resource_id" | tr '[:upper:]' '[:lower:]')

    info "Applying Terraform configuration..."
    info "  AgentCore Runtime ARN: $AGENTCORE_RUNTIME_ARN"
    if ! terraform apply -auto-approve \
        -var="use_case_id=$resource_id" \
        -var="use_case_name=$USE_CASE_ID" \
        -var="framework=$framework_short" \
        -var="aws_region=$AWS_REGION" \
        -var="agentcore_runtime_arn=$AGENTCORE_RUNTIME_ARN"; then
        error "Terraform apply failed"
        popd > /dev/null
        return 1
    fi

    # Export outputs
    UI_BUCKET=$(terraform output -raw ui_bucket_name)
    CLOUDFRONT_DIST_ID=$(terraform output -raw cloudfront_distribution_id)
    CLOUDFRONT_DOMAIN=$(terraform output -raw cloudfront_domain)
    API_ENDPOINT=$(terraform output -raw api_endpoint)
    UI_URL=$(terraform output -raw ui_url)

    popd > /dev/null
    return 0
}

generate_runtime_config() {
    local config_file="$UI_PATH/public/runtime-config.json"

    # Read use case metadata from registry
    local use_case_name use_case_display_name description agents_json

    use_case_name="$USE_CASE_ID"

    # Extract use case info from registry
    use_case_display_name=$(jq -r --arg name "$use_case_name" \
        '.use_cases[] | select(.use_case_name == $name) | .name' "$REGISTRY_FILE")
    description=$(jq -r --arg name "$use_case_name" \
        '.use_cases[] | select(.use_case_name == $name) | .description' "$REGISTRY_FILE")
    agents_json=$(jq -c --arg name "$use_case_name" \
        '.use_cases[] | select(.use_case_name == $name) | .agents // []' "$REGISTRY_FILE")
    test_entities=$(jq -c --arg name "$use_case_name" \
        '.use_cases[] | select(.use_case_name == $name) | .test_customers // []' "$REGISTRY_FILE")

    # Build agents array with descriptions
    local agents_with_desc
    agents_with_desc=$(echo "$agents_json" | jq -c '[.[] | {id: .id, name: .name, description: ("Specialized AI agent: " + .name)}]')

    # Generate runtime config
    cat > "$config_file" <<EOF
{
  "use_case_id": "$use_case_name",
  "use_case_name": "$use_case_display_name",
  "description": "$description",
  "domain": "FSI",
  "agents": $agents_with_desc,
  "api_endpoint": "$API_ENDPOINT/invoke",
  "input_schema": {
    "id_field": "customer_id",
    "id_label": "Customer ID",
    "id_placeholder": "e.g. CUST001",
    "type_field": "assessment_type",
    "type_options": [
      {"value": "full", "label": "Full Assessment"}
    ],
    "test_entities": $test_entities
  }
}
EOF

    info "Generated runtime-config.json with API endpoint: $API_ENDPOINT/invoke"
}

build_ui() {
    pushd "$UI_PATH" > /dev/null

    info "Installing dependencies..."
    npm install --silent

    info "Building UI..."
    npm run build

    popd > /dev/null
}

upload_ui() {
    info "Uploading UI to S3: $UI_BUCKET"
    aws s3 sync "$UI_PATH/dist" "s3://$UI_BUCKET" \
        --delete \
        --region "$AWS_REGION" \
        --cache-control "public, max-age=31536000, immutable" \
        --exclude "index.html" \
        --exclude "runtime-config.json"

    # Upload index.html and config with short cache
    aws s3 cp "$UI_PATH/dist/index.html" "s3://$UI_BUCKET/index.html" \
        --region "$AWS_REGION" \
        --cache-control "public, max-age=60"

    aws s3 cp "$UI_PATH/dist/runtime-config.json" "s3://$UI_BUCKET/runtime-config.json" \
        --region "$AWS_REGION" \
        --cache-control "public, max-age=60"
}

invalidate_cloudfront() {
    info "Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
        --distribution-id "$CLOUDFRONT_DIST_ID" \
        --paths "/*" \
        --region us-east-1 \
        --output text > /dev/null
}

# ============================================================================
# Main
# ============================================================================

deploy_ui() {
    section "AVA - UI Deployment (AgentCore)"
    echo ""

    # Step 1: Prerequisites
    step "Step 1/5: Checking UI prerequisites..."
    if ! check_ui_prerequisites; then
        die "UI prerequisites check failed"
    fi
    success "Prerequisites check passed"
    echo ""

    # Step 2: Deploy infrastructure
    step "Step 2/5: Deploying UI infrastructure (Lambda, S3, CloudFront)..."
    if ! deploy_ui_infrastructure; then
        die "UI infrastructure deployment failed"
    fi
    success "UI infrastructure deployed"
    info "API Endpoint: $API_ENDPOINT"
    info "CloudFront: $CLOUDFRONT_DOMAIN"
    echo ""

    # Step 3: Generate config
    step "Step 3/5: Generating runtime configuration..."
    generate_runtime_config
    success "Runtime config generated"
    echo ""

    # Step 4: Build UI
    step "Step 4/5: Building UI application..."
    if ! build_ui; then
        die "UI build failed"
    fi
    success "UI built successfully"
    echo ""

    # Step 5: Upload and invalidate
    step "Step 5/5: Uploading UI to S3 and invalidating CloudFront..."
    upload_ui
    invalidate_cloudfront
    success "UI deployed successfully"
    echo ""

    section "UI Deployment Complete!"
    echo ""
    echo -e "  ${BLUE}UI URL:${NC}        $UI_URL"
    echo -e "  ${BLUE}CloudFront:${NC}    $CLOUDFRONT_DOMAIN"
    echo -e "  ${BLUE}S3 Bucket:${NC}     $UI_BUCKET"
    echo -e "  ${BLUE}API Endpoint:${NC}  $API_ENDPOINT"
    echo ""

    return 0
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    validate_required_vars
    deploy_ui
fi
