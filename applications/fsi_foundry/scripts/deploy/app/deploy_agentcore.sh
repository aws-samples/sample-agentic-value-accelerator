#!/bin/bash

# ============================================================================
# AVA - Generic App-Only Deployment Script for AgentCore
# ============================================================================
# Generic app-only deployment script that works with any registered use case.
# Deploys ONLY the application (Docker image) to existing AgentCore infrastructure.
# Infrastructure must already exist (use scripts/deploy/full/deploy_agentcore.sh first).
#
# This script:
# 1. Sources all library modules for consistent behavior
# 2. Validates required variables
# 3. Verifies infrastructure exists (checks Terraform state for infra module)
# 4. Builds Docker image with ARM64 architecture
# 5. Pushes Docker image to ECR
# 6. Updates AgentCore runtime via Terraform
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
# Requirements: 4.6
# ============================================================================

set -e  # Exit on error

# ============================================================================
# Script Initialization
# ============================================================================

# Resolve script location and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# From scripts/deploy/app/ we need to go 5 levels up to project root
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

# Source Terraform module (workspace management, state verification)
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
    section "AVA - AgentCore App-Only Deployment"
    echo ""
    
    # ========================================================================
    # Step 1: Validate Required Variables
    # ========================================================================
    # Requirement 1.8: Validate that all required Global_Variables are set
    
    step "Step 1/6: Validating required variables..."
    
    if ! validate_required_vars; then
        die "Please set all required environment variables and try again."
    fi
    
    success "All required variables are set"
    show_deployment_summary
    
    # ========================================================================
    # Step 2: Check Prerequisites
    # ========================================================================
    
    step "Step 2/6: Checking prerequisites..."
    
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
    
    # Get AWS account ID for later use
    AWS_ACCOUNT_ID=$(get_aws_account_id)
    
    success "Prerequisites check passed"
    info "AWS Account: $AWS_ACCOUNT_ID"
    info "AWS Region: $AWS_REGION"
    echo ""
    
    # ========================================================================
    # Step 3: Verify Infrastructure Exists
    # ========================================================================
    # For app-only deployment, infrastructure must already exist
    # We verify this by checking Terraform state for the infra module
    
    step "Step 3/6: Verifying infrastructure exists..."
    
    # Get framework short name for workspace naming (must match full deployment)
    FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
    info "Framework: $FRAMEWORK"
    info "Framework short name: $FRAMEWORK_SHORT"
    
    WORKSPACE_NAME=$(get_workspace_name "$USE_CASE_ID" "$FRAMEWORK_SHORT" "$AWS_REGION")
    info "Workspace: $WORKSPACE_NAME"
    
    # Check if infrastructure Terraform state exists
    if ! agentcore_infra_state_exists; then
        error "AgentCore infrastructure not found for workspace '$WORKSPACE_NAME'"
        echo ""
        echo -e "${YELLOW}Infrastructure must be deployed first. Run:${NC}"
        echo ""
        echo "  USE_CASE_ID=$USE_CASE_ID FRAMEWORK=$FRAMEWORK AWS_REGION=$AWS_REGION \\"
        echo "    $PROJECT_ROOT/applications/scripts/deploy/full/deploy_agentcore.sh"
        echo ""
        die "Infrastructure not found. Please deploy infrastructure first."
    fi
    
    # Get ECR repository details from Terraform output
    ECR_REPO_NAME=$(get_agentcore_infra_output "agentcore_ecr_repository_name")
    ECR_REPO_URI=$(get_agentcore_infra_output "agentcore_ecr_repository")
    
    if [[ -z "$ECR_REPO_URI" ]]; then
        error "Failed to get ECR repository URI from Terraform outputs"
        echo ""
        echo -e "${YELLOW}The infrastructure may be incomplete. Run full deployment:${NC}"
        echo ""
        echo "  USE_CASE_ID=$USE_CASE_ID FRAMEWORK=$FRAMEWORK AWS_REGION=$AWS_REGION \\"
        echo "    $PROJECT_ROOT/applications/scripts/deploy/full/deploy_agentcore.sh"
        echo ""
        die "Infrastructure incomplete. Please run full deployment."
    fi
    
    success "Infrastructure verified"
    info "ECR Repository: $ECR_REPO_URI"
    echo ""
    
    # ========================================================================
    # Step 4: Build Docker Image (ARM64)
    # ========================================================================
    # Requirement 2.2: Use naming convention ava-{USE_CASE_ID}-{FRAMEWORK_SHORT}-{PATTERN}
    # Requirement 2.3: Accept USE_CASE_ID and FRAMEWORK as build arguments
    # Note: AgentCore requires ARM64 architecture
    
    step "Step 4/6: Building Docker image (ARM64)..."
    
    # Validate application code exists
    if ! validate_application_code_exists "$USE_CASE_ID" "$FRAMEWORK"; then
        die "Application code not found"
    fi
    
    # Get framework short name for image tagging
    FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
    FULL_IMAGE_TAG="${FRAMEWORK_SHORT}-${IMAGE_TAG}"
    
    info "Framework: $FRAMEWORK"
    info "Image Tag: $FULL_IMAGE_TAG"
    
    # Build Docker image for ARM64 (required by AgentCore)
    if ! build_agentcore_docker_image "$ECR_REPO_NAME" "$FULL_IMAGE_TAG"; then
        die "Docker build failed"
    fi
    
    success "Docker image built: ${ECR_REPO_NAME}:${FULL_IMAGE_TAG}"
    echo ""
    
    # ========================================================================
    # Step 5: Push Docker Image to ECR
    # ========================================================================
    # Requirement 2.6: Use repository names that include use case identifier for isolation
    
    step "Step 5/6: Pushing Docker image to ECR..."
    
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
    # Step 6: Update AgentCore Runtime
    # ========================================================================
    # Requirement 4.6: Support app-only deployment mode
    # Only updates the runtime with the new image, does NOT touch infrastructure
    
    step "Step 6/6: Updating AgentCore Runtime..."
    
    info "This will update the runtime to use the new image from ECR..."
    
    if ! update_agentcore_runtime "$FULL_IMAGE_TAG"; then
        die "AgentCore runtime update failed"
    fi
    
    success "AgentCore Runtime updated successfully"
    echo ""
    
    # Get runtime details from Terraform output
    RUNTIME_ARN=$(get_agentcore_runtime_output "agentcore_runtime_arn" 2>/dev/null || echo "")
    RUNTIME_ID=$(get_agentcore_runtime_output "agentcore_runtime_id" 2>/dev/null || echo "")
    
    # ========================================================================
    # Deployment Complete
    # ========================================================================
    
    section "App-Only Deployment Complete!"
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
    
    echo ""
    echo -e "${YELLOW}Test the deployment:${NC}"
    echo ""
    echo "  $PROJECT_ROOT/applications/scripts/test/test_agentcore.sh"
    echo ""
    
    return 0
}

# ============================================================================
# AgentCore Infrastructure State Verification
# ============================================================================

# Check if AgentCore infrastructure state exists
# Usage: if agentcore_infra_state_exists; then ...
#
# Returns:
#   0 if infrastructure state exists
#   1 if infrastructure state does not exist
agentcore_infra_state_exists() {
    local infra_path="$PROJECT_ROOT/$AGENTCORE_INFRA_PATH"
    
    if [[ ! -d "$infra_path" ]]; then
        return 1
    fi
    
    # Get framework short name for workspace naming (must match full deployment)
    local framework_short
    framework_short=$(get_framework_short_name "$FRAMEWORK")
    
    local workspace_name
    workspace_name=$(get_workspace_name "$USE_CASE_ID" "$framework_short" "$AWS_REGION")
    
    # Check for local state file
    local state_file="$infra_path/terraform.tfstate.d/${workspace_name}/terraform.tfstate"
    
    if [[ -f "$state_file" ]]; then
        return 0
    fi
    
    # Also check if workspace exists in Terraform
    pushd "$infra_path" > /dev/null || return 1
    
    # Initialize Terraform if needed
    if [[ ! -d ".terraform" ]]; then
        terraform init > /dev/null 2>&1 || {
            popd > /dev/null
            return 1
        }
    fi
    
    # Check if workspace exists
    if terraform workspace list 2>/dev/null | grep -q "^[* ]*${workspace_name}$"; then
        # Workspace exists, select it and check for resources
        terraform workspace select "$workspace_name" > /dev/null 2>&1 || {
            popd > /dev/null
            return 1
        }
        
        # Check if there are any resources in the state
        local resource_count
        resource_count=$(terraform state list 2>/dev/null | wc -l)
        
        popd > /dev/null
        
        if [[ "$resource_count" -gt 0 ]]; then
            return 0
        fi
    else
        popd > /dev/null
    fi
    
    return 1
}

# Get output from AgentCore infra module
# Usage: VALUE=$(get_agentcore_infra_output "output_name")
get_agentcore_infra_output() {
    local output_name="$1"
    local infra_path="$PROJECT_ROOT/$AGENTCORE_INFRA_PATH"
    
    if [[ ! -d "$infra_path" ]]; then
        return 1
    fi
    
    # Get framework short name for workspace naming (must match full deployment)
    local framework_short
    framework_short=$(get_framework_short_name "$FRAMEWORK")
    
    local workspace_name
    workspace_name=$(get_workspace_name "$USE_CASE_ID" "$framework_short" "$AWS_REGION")
    
    pushd "$infra_path" > /dev/null || return 1
    
    # Initialize Terraform if needed
    if [[ ! -d ".terraform" ]]; then
        terraform init > /dev/null 2>&1 || {
            popd > /dev/null
            return 1
        }
    fi
    
    # Select workspace
    terraform workspace select "$workspace_name" > /dev/null 2>&1 || {
        popd > /dev/null
        return 1
    }
    
    terraform output -raw "$output_name" 2>/dev/null
    local result=$?
    
    popd > /dev/null
    return $result
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
# AgentCore Runtime Update
# ============================================================================

# Update AgentCore runtime via Terraform (app-only, no infra changes)
# Usage: update_agentcore_runtime "image_tag"
update_agentcore_runtime() {
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
    
    # Get framework short name for workspace naming (must match full deployment)
    local framework_short
    framework_short=$(get_framework_short_name "$FRAMEWORK")
    
    # Select or create workspace
    local workspace_name
    workspace_name=$(get_workspace_name "$USE_CASE_ID" "$framework_short" "$AWS_REGION")
    
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

    # Clean up any ROLLBACK_COMPLETE CloudFormation stacks from prior failed deploys
    local use_case_id_cfn framework_short_cfn stack_name stack_status
    use_case_id_cfn=$(echo "$resource_id" | tr '_' '-')
    framework_short_cfn=$(echo "$(get_framework_short_name "$FRAMEWORK")" | tr '_' '-')
    stack_name="ava-${use_case_id_cfn}-${framework_short_cfn}-agentcore-runtime-$(echo "$AWS_REGION" | tr -d '-')"
    stack_status=$(aws cloudformation describe-stacks --stack-name "$stack_name" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || true)
    if [[ "$stack_status" == "ROLLBACK_COMPLETE" ]]; then
        info "Deleting ROLLBACK_COMPLETE stack: $stack_name"
        aws cloudformation delete-stack --stack-name "$stack_name"
        aws cloudformation wait stack-delete-complete --stack-name "$stack_name" 2>/dev/null || true
    fi

    # Apply Terraform with image tag (only updates runtime, not infra)
    info "Applying Terraform configuration..."
    if ! terraform apply \
        -var="aws_region=${AWS_REGION}" \
        -var="use_case_id=${resource_id}" \
        -var="image_tag=${image_tag}" \
        -var="framework=${FRAMEWORK}" \
        -var="use_case_name=${USE_CASE_ID}" \
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
    
    if [[ ! -d "$runtime_path" ]]; then
        return 1
    fi
    
    # Get framework short name for workspace naming (must match full deployment)
    local framework_short
    framework_short=$(get_framework_short_name "$FRAMEWORK")
    
    local workspace_name
    workspace_name=$(get_workspace_name "$USE_CASE_ID" "$framework_short" "$AWS_REGION")
    
    pushd "$runtime_path" > /dev/null || return 1
    
    # Select workspace
    terraform workspace select "$workspace_name" > /dev/null 2>&1 || {
        popd > /dev/null
        return 1
    }
    
    terraform output -raw "$output_name" 2>/dev/null
    local result=$?
    
    popd > /dev/null
    return $result
}

# ============================================================================
# Script Entry Point
# ============================================================================

# Run main function
main "$@"
