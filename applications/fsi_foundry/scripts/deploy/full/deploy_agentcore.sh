#!/bin/bash

# ============================================================================
# AVA - Generic Full Deployment Script for AgentCore
# ============================================================================
# Generic deployment script that works with any registered use case.
# Deploys both infrastructure (Terraform) and application (Docker) to AgentCore.
#
# This script:
# 1. Sources all library modules for consistent behavior
# 2. Validates required variables and registry entries
# 3. Checks for use-case-specific override scripts
# 4. Selects/creates Terraform workspace for infrastructure
# 5. Runs Terraform apply for infrastructure (ECR, IAM, S3)
# 6. Builds Docker image with ARM64 architecture
# 7. Pushes Docker image to ECR
# 8. Deploys AgentCore runtime via Terraform
# 9. Deploys UI (Lambda proxy, S3, CloudFront)
#
# Usage:
#   ./deploy_agentcore.sh
#
# Required Environment Variables:
#   USE_CASE_ID        - Use case identifier (e.g., "kyc")
#   FRAMEWORK          - AI framework (e.g., "langchain_langgraph")
#   DEPLOYMENT_PATTERN - Must be "agentcore" (set automatically if not provided)
#   AWS_REGION         - Target AWS region (e.g., "us-west-2")
#
# Optional Environment Variables:
#   AWS_PROFILE        - AWS CLI profile (default: "default")
#   IMAGE_TAG          - Docker image tag (default: "latest")
#
# Requirements: 4.1, 4.3, 4.4, 4.5, 4.6
# ============================================================================

set -e  # Exit on error

# ============================================================================
# Script Initialization
# ============================================================================

# Resolve script location and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# From applications/fsi_foundry/scripts/deploy/full/ we need to go 5 levels up to project root
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"

# Set deployment pattern for this script
export DEPLOYMENT_PATTERN="agentcore"

# Default image tag
IMAGE_TAG="${IMAGE_TAG:-latest}"

# ============================================================================
# Source Library Modules
# ============================================================================
# Source all shared library modules for consistent behavior across scripts

# Source common utilities (colors, error handling, path resolution)
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/common.sh"

# Source global variables module (validation, export functions)
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/variables.sh"

# Source registry module (use case, framework, pattern validation)
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"

# Source Docker module (image naming, building)
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/docker.sh"

# Source Terraform module (workspace management, apply/destroy)
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/terraform.sh"

# ============================================================================
# AgentCore-Specific Paths
# ============================================================================
# AgentCore has two Terraform modules: infra and runtime

AGENTCORE_INFRA_PATH="applications/fsi_foundry/foundations/iac/agentcore/infra"
AGENTCORE_RUNTIME_PATH="applications/fsi_foundry/foundations/iac/agentcore/runtime"

# ============================================================================
# Main Deployment Function
# ============================================================================

main() {
    section "AVA - AgentCore Full Deployment"
    echo ""
    
    # ========================================================================
    # Step 1: Validate Required Variables
    # ========================================================================
    # Requirement 1.8: Validate that all required Global_Variables are set
    
    step "Step 1/9: Validating required variables..."
    
    if ! validate_required_vars; then
        die "Please set all required environment variables and try again."
    fi
    
    success "All required variables are set"
    show_deployment_summary
    
    # ========================================================================
    # Step 2: Validate Registry Entries
    # ========================================================================
    # Requirement 4.7: Fail with descriptive error if use case not found
    # Requirement 4.3: Validate framework and pattern are supported
    
    step "Step 2/9: Validating registry entries..."
    
    # Validate registry structure
    if ! validate_registry; then
        die "Registry validation failed. Please check $REGISTRY_FILE"
    fi
    
    # Validate use case exists
    if ! validate_use_case_exists "$USE_CASE_ID"; then
        die "Use case '$USE_CASE_ID' not found in registry"
    fi
    
    # Validate framework is supported for this use case
    if ! validate_framework_supported "$USE_CASE_ID" "$FRAMEWORK"; then
        die "Framework '$FRAMEWORK' is not supported for use case '$USE_CASE_ID'"
    fi
    
    # Validate deployment pattern is supported for this use case
    if ! validate_pattern_supported "$USE_CASE_ID" "$DEPLOYMENT_PATTERN"; then
        die "Deployment pattern '$DEPLOYMENT_PATTERN' is not supported for use case '$USE_CASE_ID'"
    fi
    
    success "Registry validation passed"
    echo ""
    
    # ========================================================================
    # Step 3: Check for Use-Case-Specific Override Script
    # ========================================================================
    # Requirement 6.4: Support override scripts in applications/{USE_CASE_ID}/scripts/
    # Requirement 6.6: Check for use-case-specific overrides before using generic scripts
    
    step "Step 3/9: Checking for use-case-specific override..."
    
    OVERRIDE_SCRIPT="$PROJECT_ROOT/applications/use_cases/$USE_CASE_ID/scripts/deploy_agentcore.sh"
    
    if [[ -f "$OVERRIDE_SCRIPT" ]]; then
        info "Found override script: $OVERRIDE_SCRIPT"
        info "Executing use-case-specific deployment..."
        echo ""
        
        # Export all variables for the override script
        export_global_vars
        
        # Execute the override script instead of continuing with generic flow
        exec "$OVERRIDE_SCRIPT"
    fi
    
    success "No override script found, using generic deployment"
    echo ""
    
    # ========================================================================
    # Step 4: Check Prerequisites
    # ========================================================================
    
    step "Step 4/9: Checking prerequisites..."
    
    # Check required tools
    if ! check_prerequisites; then
        die "Missing required tools. Please install them and try again."
    fi
    
    # Check Docker is available (required for AgentCore pattern)
    if ! check_docker; then
        die "Docker is required for AgentCore deployment pattern"
    fi
    
    # Check Docker buildx is available (required for ARM64 builds)
    if ! docker buildx version &> /dev/null; then
        warn "Docker buildx not found. ARM64 builds may not work correctly."
        info "To enable buildx: docker buildx create --use"
    fi
    
    # Verify AWS credentials
    if ! check_aws_credentials; then
        die "AWS credentials not configured. Please run: aws configure"
    fi
    
    # Check Bedrock model access (required for AI agents)
    if ! check_bedrock_model_access "$AWS_REGION"; then
        die "Bedrock model access required. Please enable Claude models in AWS Console."
    fi
    
    # Check AgentCore region availability
    if ! check_agentcore_region "$AWS_REGION"; then
        warn "AgentCore may not be available in $AWS_REGION. Proceeding anyway..."
    fi
    
    # Get AWS account ID for later use
    AWS_ACCOUNT_ID=$(get_aws_account_id)
    
    success "Prerequisites check passed"
    info "AWS Account: $AWS_ACCOUNT_ID"
    info "AWS Region: $AWS_REGION"
    echo ""
    
    # ========================================================================
    # Step 5: Deploy Infrastructure (ECR, IAM, S3)
    # ========================================================================
    # Requirement 3.1: Use Terraform workspaces with naming convention {USE_CASE_ID}-{FRAMEWORK_SHORT}-{AWS_REGION}
    # Requirement 3.2: Automatically select or create the appropriate workspace
    # Requirement 4.4: Automatically configure Terraform workspace based on USE_CASE_ID, FRAMEWORK, and AWS_REGION
    
    step "Step 5/9: Deploying infrastructure (ECR, IAM, S3)..."
    
    # Get framework short name for workspace naming and resource isolation
    # Requirement 4.3: Pass the framework variable to both infra and runtime Terraform modules
    # Requirement 4.5: Show the framework being deployed
    FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
    info "Framework: $FRAMEWORK"
    info "Framework short name: $FRAMEWORK_SHORT"
    
    WORKSPACE_NAME=$(get_workspace_name "$USE_CASE_ID" "$FRAMEWORK_SHORT" "$AWS_REGION")
    info "Workspace: $WORKSPACE_NAME"
    
    # Deploy infrastructure using the infra module
    if ! deploy_agentcore_infra; then
        die "Failed to deploy AgentCore infrastructure"
    fi
    
    success "Infrastructure deployed successfully"
    echo ""
    
    # Get ECR repository details from Terraform output
    ECR_REPO_NAME=$(get_agentcore_infra_output "agentcore_ecr_repository_name")
    ECR_REPO_URI=$(get_agentcore_infra_output "agentcore_ecr_repository")
    S3_DATA_BUCKET=$(get_agentcore_infra_output "s3_data_bucket")
    
    if [[ -z "$ECR_REPO_URI" ]]; then
        die "Failed to get ECR repository URI from Terraform outputs"
    fi
    
    info "ECR Repository: $ECR_REPO_URI"
    
    # Upload sample data to S3
    if [[ -n "$S3_DATA_BUCKET" ]]; then
        info "S3 Data Bucket: $S3_DATA_BUCKET"
        info "Uploading sample data..."
        upload_sample_data "$USE_CASE_ID" "$S3_DATA_BUCKET" "$AWS_REGION"
    fi
    echo ""
    
    # ========================================================================
    # Step 6: Build Docker Image (ARM64)
    # ========================================================================
    # Requirement 2.2: Use naming convention ava-{USE_CASE_ID}-{FRAMEWORK_SHORT}-{PATTERN}
    # Requirement 2.3: Accept USE_CASE_ID and FRAMEWORK as build arguments
    # Requirement 4.5: Build Docker images with the correct naming convention
    # Note: AgentCore requires ARM64 architecture
    
    step "Step 6/9: Building Docker image (ARM64)..."
    
    # Validate application code exists
    if ! validate_application_code_exists "$USE_CASE_ID" "$FRAMEWORK"; then
        die "Application code not found"
    fi
    
    # Use framework short name (already set in Step 5) for image tagging
    FULL_IMAGE_TAG="${FRAMEWORK_SHORT}-${IMAGE_TAG}"
    
    info "Image Tag: $FULL_IMAGE_TAG"
    
    # Build Docker image for ARM64 (required by AgentCore)
    if ! build_agentcore_docker_image "$ECR_REPO_NAME" "$FULL_IMAGE_TAG"; then
        die "Docker build failed"
    fi
    
    success "Docker image built: ${ECR_REPO_NAME}:${FULL_IMAGE_TAG}"
    echo ""
    
    # ========================================================================
    # Step 7: Push Docker Image to ECR
    # ========================================================================
    # Requirement 2.6: Use repository names that include use case identifier for isolation
    
    step "Step 7/9: Pushing Docker image to ECR..."
    
    # Login to ECR
    info "Logging into Amazon ECR..."
    if ! aws ecr get-login-password --region "$AWS_REGION" | \
        docker login --username AWS --password-stdin \
        "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"; then
        die "ECR login failed"
    fi
    
    # Tag image for ECR
    info "Tagging Docker image..."
    docker tag "${ECR_REPO_NAME}:${FULL_IMAGE_TAG}" "${ECR_REPO_URI}:${FULL_IMAGE_TAG}"
    
    # Push to ECR
    info "Pushing Docker image to ECR..."
    if ! docker push "${ECR_REPO_URI}:${FULL_IMAGE_TAG}"; then
        die "Docker push failed"
    fi
    
    success "Docker image pushed to ECR: ${ECR_REPO_URI}:${FULL_IMAGE_TAG}"
    echo ""
    
    # ========================================================================
    # Step 8: Deploy AgentCore Runtime
    # ========================================================================
    # Requirement 4.6: Support full deployment (infrastructure + application)
    
    step "Step 8/9: Deploying AgentCore Runtime..."
    
    info "This will create the runtime and pull the image from ECR..."
    
    if ! deploy_agentcore_runtime "$FULL_IMAGE_TAG"; then
        die "AgentCore runtime deployment failed"
    fi
    
    success "AgentCore Runtime deployed successfully"
    echo ""
    
    # Get runtime details from Terraform output
    RUNTIME_ARN=$(get_agentcore_runtime_output "agentcore_runtime_arn" 2>/dev/null || echo "")
    RUNTIME_ID=$(get_agentcore_runtime_output "agentcore_runtime_id" 2>/dev/null || echo "")

    # ========================================================================
    # Step 9: Deploy UI
    # ========================================================================

    step "Step 9/9: Checking for UI deployment..."

    UI_USE_CASE_PATH="$PROJECT_ROOT/applications/fsi_foundry/ui/$USE_CASE_ID"
    if [[ -d "$UI_USE_CASE_PATH" && -n "$RUNTIME_ARN" ]]; then
        info "UI found for use case '$USE_CASE_ID' — deploying..."
        export AGENTCORE_RUNTIME_ARN="$RUNTIME_ARN"

        # Source UI deploy functions
        source "$SCRIPT_DIR/deploy_ui.sh"

        if deploy_ui; then
            UI_DEPLOYED=true
        else
            warn "UI deployment failed — AgentCore runtime is still operational"
            UI_DEPLOYED=false
        fi
    else
        if [[ ! -d "$UI_USE_CASE_PATH" ]]; then
            info "No UI available for use case '$USE_CASE_ID' — skipping UI deployment"
        else
            warn "Skipping UI deployment — could not retrieve runtime ARN"
        fi
        UI_DEPLOYED=false
    fi
    echo ""

    # ========================================================================
    # Deployment Complete
    # ========================================================================

    section "Deployment Complete!"
    echo ""
    echo -e "  ${BLUE}Use Case:${NC}     $USE_CASE_ID"
    echo -e "  ${BLUE}Framework:${NC}    $FRAMEWORK"
    echo -e "  ${BLUE}Pattern:${NC}      $DEPLOYMENT_PATTERN"
    echo -e "  ${BLUE}Region:${NC}       $AWS_REGION"
    echo -e "  ${BLUE}Workspace:${NC}    $WORKSPACE_NAME"
    echo -e "  ${BLUE}Image URI:${NC}    ${ECR_REPO_URI}:${FULL_IMAGE_TAG}"

    if [[ -n "$RUNTIME_ARN" ]]; then
        echo ""
        echo -e "  ${BLUE}Runtime ARN:${NC} $RUNTIME_ARN"
        echo -e "  ${BLUE}Runtime ID:${NC}  $RUNTIME_ID"
    fi

    if [[ "$UI_DEPLOYED" == "true" ]]; then
        echo ""
        echo -e "  ${BLUE}UI URL:${NC}      $UI_URL"
    fi

    echo ""
    echo -e "${YELLOW}Test the deployment:${NC}"
    echo ""
    echo "  $PROJECT_ROOT/applications/fsi_foundry/scripts/use_cases/$USE_CASE_ID/test/test_agentcore.sh"
    echo ""

    return 0
}

# ============================================================================
# AgentCore Infrastructure Deployment
# ============================================================================

# Deploy AgentCore infrastructure (ECR, IAM, S3)
# Usage: deploy_agentcore_infra
# Requirement 4.3: Pass the framework variable to both infra and runtime Terraform modules
# Requirement 4.4: Include framework in workspace name generation
deploy_agentcore_infra() {
    local infra_path="$PROJECT_ROOT/$AGENTCORE_INFRA_PATH"

    if [[ ! -d "$infra_path" ]]; then
        error "AgentCore infra module not found at $AGENTCORE_INFRA_PATH"
        return 1
    fi

    pushd "$infra_path" > /dev/null

    # Initialize Terraform if needed
    if [[ ! -d ".terraform" ]]; then
        info "Initializing Terraform..."
        if ! terraform init; then
            error "Terraform initialization failed"
            popd > /dev/null
            return 1
        fi
    fi

    # Select or create workspace with framework isolation
    local workspace_name
    workspace_name=$(get_workspace_name "$USE_CASE_ID" "$FRAMEWORK_SHORT" "$AWS_REGION")

    info "Selecting Terraform workspace: $workspace_name"
    if terraform workspace list 2>/dev/null | grep -q "^[* ]*${workspace_name}$"; then
        terraform workspace select "$workspace_name"
    else
        terraform workspace new "$workspace_name"
    fi

    # Normalize use_case_id to canonical ID for resource naming
    local resource_id
    resource_id=$(normalize_use_case_to_id "$USE_CASE_ID")
    # Convert to lowercase for AWS resource naming constraints
    resource_id=$(echo "$resource_id" | tr '[:upper:]' '[:lower:]')

    # Apply Terraform with framework variable for resource isolation
    info "Applying Terraform configuration..."
    if ! terraform apply \
        -var="aws_region=${AWS_REGION}" \
        -var="use_case_id=${resource_id}" \
        -var="use_case_name=${USE_CASE_ID}" \
        -var="framework=${FRAMEWORK}" \
        -auto-approve; then
        error "Terraform apply failed"
        popd > /dev/null
        return 1
    fi

    popd > /dev/null
    return 0
}

# Clean up ROLLBACK_COMPLETE CloudFormation stacks from prior failed deploys
# Usage: cleanup_rollback_stack "resource_id" "framework_short" "aws_region"
cleanup_rollback_stack() {
    local resource_id="$1"
    local framework_short="$2"
    local aws_region="$3"

    local use_case_id_cfn framework_short_cfn stack_name stack_status
    use_case_id_cfn=$(echo "$resource_id" | tr '_' '-')
    framework_short_cfn=$(echo "$framework_short" | tr '_' '-')
    stack_name="ava-${use_case_id_cfn}-${framework_short_cfn}-agentcore-runtime-$(echo "$aws_region" | tr -d '-')"
    stack_status=$(aws cloudformation describe-stacks --stack-name "$stack_name" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || true)
    if [[ "$stack_status" == "ROLLBACK_COMPLETE" ]]; then
        info "Deleting ROLLBACK_COMPLETE stack: $stack_name"
        aws cloudformation delete-stack --stack-name "$stack_name"
        aws cloudformation wait stack-delete-complete --stack-name "$stack_name" 2>/dev/null || true
    fi
}

# Get output from AgentCore infra module
# Usage: VALUE=$(get_agentcore_infra_output "output_name")
get_agentcore_infra_output() {
    local output_name="$1"
    local infra_path="$PROJECT_ROOT/$AGENTCORE_INFRA_PATH"
    
    pushd "$infra_path" > /dev/null
    terraform output -raw "$output_name" 2>/dev/null
    popd > /dev/null
}

# ============================================================================
# AgentCore Docker Build
# ============================================================================

# Build Docker image for AgentCore (ARM64)
# Usage: build_agentcore_docker_image "repo_name" "tag"
build_agentcore_docker_image() {
    local repo_name="$1"
    local tag="$2"
    
    local dockerfile="$PROJECT_ROOT/applications/fsi_foundry/foundations/docker/patterns/agentcore.Dockerfile"

    if [[ ! -f "$dockerfile" ]]; then
        error "AgentCore Dockerfile not found at $dockerfile"
        return 1
    fi

    info "Building Docker image for ARM64..."
    info "  Dockerfile: applications/fsi_foundry/foundations/docker/patterns/agentcore.Dockerfile"
    info "  Use Case: $USE_CASE_ID"
    info "  Framework: $FRAMEWORK"
    
    # Build with buildx for ARM64 architecture
    if ! docker buildx build \
        --platform linux/arm64 \
        --build-arg USE_CASE_ID="$USE_CASE_ID" \
        --build-arg FRAMEWORK="$FRAMEWORK" \
        -t "${repo_name}:${tag}" \
        -f "$dockerfile" \
        --load \
        "$PROJECT_ROOT"; then
        error "Docker build failed"
        return 1
    fi
    
    return 0
}

# ============================================================================
# AgentCore Runtime Deployment
# ============================================================================

# Deploy AgentCore runtime via Terraform
# Usage: deploy_agentcore_runtime "image_tag"
# Requirement 4.3: Pass the framework variable to both infra and runtime Terraform modules
# Requirement 4.4: Include framework in workspace name generation
deploy_agentcore_runtime() {
    local image_tag="$1"
    local runtime_path="$PROJECT_ROOT/$AGENTCORE_RUNTIME_PATH"

    if [[ ! -d "$runtime_path" ]]; then
        error "AgentCore runtime module not found at $AGENTCORE_RUNTIME_PATH"
        return 1
    fi

    pushd "$runtime_path" > /dev/null

    # Initialize Terraform if needed
    if [[ ! -d ".terraform" ]]; then
        info "Initializing Terraform..."
        if ! terraform init; then
            error "Terraform initialization failed"
            popd > /dev/null
            return 1
        fi
    fi

    # Select or create workspace with framework isolation
    local workspace_name
    workspace_name=$(get_workspace_name "$USE_CASE_ID" "$FRAMEWORK_SHORT" "$AWS_REGION")

    info "Selecting Terraform workspace: $workspace_name"
    if terraform workspace list 2>/dev/null | grep -q "^[* ]*${workspace_name}$"; then
        terraform workspace select "$workspace_name"
    else
        terraform workspace new "$workspace_name"
    fi

    # Normalize use_case_id to canonical ID for resource naming
    local resource_id
    resource_id=$(normalize_use_case_to_id "$USE_CASE_ID")
    # Convert to lowercase for AWS resource naming constraints
    resource_id=$(echo "$resource_id" | tr '[:upper:]' '[:lower:]')

    # Generate short deploy suffix and clean up any failed stacks
    cleanup_rollback_stack "$resource_id" "$FRAMEWORK_SHORT" "$AWS_REGION"

    # Apply Terraform with image tag and framework variable
    info "Applying Terraform configuration..."
    if ! terraform apply \
        -var="aws_region=${AWS_REGION}" \
        -var="use_case_id=${resource_id}" \
        -var="use_case_name=${USE_CASE_ID}" \
        -var="image_tag=${image_tag}" \
        -var="framework=${FRAMEWORK}" \
        -auto-approve; then
        error "Terraform apply failed"
        popd > /dev/null
        return 1
    fi

    popd > /dev/null
    return 0
}

# Get output from AgentCore runtime module
# Usage: VALUE=$(get_agentcore_runtime_output "output_name")
get_agentcore_runtime_output() {
    local output_name="$1"
    local runtime_path="$PROJECT_ROOT/$AGENTCORE_RUNTIME_PATH"
    
    pushd "$runtime_path" > /dev/null
    terraform output -raw "$output_name" 2>/dev/null
    popd > /dev/null
}

# ============================================================================
# Script Entry Point
# ============================================================================

# Run main function
main "$@"
