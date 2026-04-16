#!/bin/bash

# ============================================================================
# AVA - Generic Cleanup Script for AgentCore
# ============================================================================
# Generic cleanup script that works with any registered use case.
# Destroys AgentCore runtime and infrastructure, and cleans up ECR images.
#
# This script:
# 1. Sources all library modules for consistent behavior
# 2. Validates required variables
# 3. Selects the correct Terraform workspace for the use case
# 4. Destroys AgentCore runtime FIRST (reverse order of deployment)
# 5. Destroys AgentCore infrastructure
# 6. Cleans up ECR images for the use case
#
# Usage:
#   ./cleanup_agentcore.sh
#
# Required Environment Variables:
#   USE_CASE_ID        - Use case identifier (e.g., "kyc")
#   FRAMEWORK          - AI framework (e.g., "langchain_langgraph")
#   DEPLOYMENT_PATTERN - Must be "agentcore" (set automatically if not provided)
#   AWS_REGION         - Target AWS region (e.g., "us-west-2")
#
# Optional Environment Variables:
#   AWS_PROFILE        - AWS CLI profile (default: "default")
#   SKIP_CONFIRMATION  - Set to "true" to skip confirmation prompts
#
# Requirements: 3.7, 4.8
# ============================================================================

set -e  # Exit on error

# ============================================================================
# Script Initialization
# ============================================================================

# Resolve script location and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# From applications/fsi_foundry/scripts/cleanup/ we need to go 4 levels up to project root
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

# Set deployment pattern for this script
export DEPLOYMENT_PATTERN="agentcore"

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

# Source Docker module (image naming, cleanup)
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/docker.sh"

# Source Terraform module (workspace management, destroy)
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/terraform.sh"

# ============================================================================
# AgentCore-Specific Functions
# ============================================================================

# Destroy AgentCore UI Terraform module (CloudFront, S3, Lambda, DynamoDB, API Gateway)
# This must be destroyed FIRST (reverse order of deployment)
destroy_agentcore_ui() {
    local use_case_id="$1"
    local framework_short="$2"
    local region="$3"

    local ui_path="$PROJECT_ROOT/applications/fsi_foundry/foundations/iac/agentcore/ui"
    local workspace_name
    workspace_name=$(get_workspace_name "$use_case_id" "$framework_short" "$region")

    info "Destroying AgentCore UI..."
    info "  Workspace: $workspace_name"

    if [[ ! -d "$ui_path" ]]; then
        info "AgentCore UI module not found, skipping."
        return 0
    fi

    pushd "$ui_path" > /dev/null

    if [[ ! -d ".terraform" ]]; then
        info "Initializing Terraform for UI module..."
        if ! terraform init; then
            popd > /dev/null
            error "Terraform initialization failed for UI module"
            return 1
        fi
    fi

    if ! terraform workspace list 2>/dev/null | grep -q "^[* ]*${workspace_name}$"; then
        info "Workspace '$workspace_name' does not exist for UI module. Skipping."
        popd > /dev/null
        return 0
    fi

    if ! terraform workspace select "$workspace_name"; then
        popd > /dev/null
        error "Failed to select workspace '$workspace_name' for UI module"
        return 1
    fi

    # Normalize use_case_id to canonical ID for resource naming
    local resource_id
    resource_id=$(normalize_use_case_to_id "$use_case_id")
    resource_id=$(echo "$resource_id" | tr '[:upper:]' '[:lower:]')

    if terraform destroy \
        -var "use_case_id=$resource_id" \
        -var "use_case_name=$use_case_id" \
        -var "framework=$framework_short" \
        -var "aws_region=$region" \
        -var "agentcore_runtime_arn=arn:aws:bedrock-agentcore:${region}:000000000000:runtime/placeholder" \
        -auto-approve; then

        terraform workspace select default 2>/dev/null || true
        terraform workspace delete "$workspace_name" 2>/dev/null || true

        popd > /dev/null
        success "AgentCore UI destroyed successfully"
        return 0
    else
        popd > /dev/null
        error "Failed to destroy AgentCore UI"
        return 1
    fi
}

# Destroy AgentCore runtime Terraform module
# This must be destroyed BEFORE infrastructure (reverse order of deployment)
# Requirement 6.2: Select the correct framework-specific workspace
destroy_agentcore_runtime() {
    local use_case_id="$1"
    local framework_short="$2"
    local region="$3"
    
    local runtime_path="$PROJECT_ROOT/applications/fsi_foundry/foundations/iac/agentcore/runtime"
    local workspace_name
    workspace_name=$(get_workspace_name "$use_case_id" "$framework_short" "$region")
    
    info "Destroying AgentCore runtime..."
    info "  Workspace: $workspace_name"
    
    # Check if runtime module exists
    if [[ ! -d "$runtime_path" ]]; then
        warn "AgentCore runtime module not found at applications/foundations/iac/agentcore/runtime"
        return 0
    fi
    
    pushd "$runtime_path" > /dev/null
    
    # Initialize Terraform if needed
    if [[ ! -d ".terraform" ]]; then
        info "Initializing Terraform for runtime module..."
        if ! terraform init; then
            popd > /dev/null
            error "Terraform initialization failed for runtime module"
            return 1
        fi
    fi
    
    # Check if workspace exists
    if ! terraform workspace list 2>/dev/null | grep -q "^[* ]*${workspace_name}$"; then
        info "Workspace '$workspace_name' does not exist for runtime module. Skipping."
        popd > /dev/null
        return 0
    fi
    
    # Select the workspace
    if ! terraform workspace select "$workspace_name"; then
        popd > /dev/null
        error "Failed to select Terraform workspace '$workspace_name' for runtime module"
        return 1
    fi
    
    # Execute terraform destroy with required variables
    # Use the framework_short parameter passed to this function for image tag
    if terraform destroy \
        -var "use_case_id=$use_case_id" \
        -var "aws_region=$region" \
        -var "framework=$FRAMEWORK" \
        -var "image_tag=${framework_short}-latest" \
        -auto-approve; then
        
        # Switch to default workspace and delete the use case workspace
        terraform workspace select default 2>/dev/null || true
        terraform workspace delete "$workspace_name" 2>/dev/null || true
        
        popd > /dev/null
        success "AgentCore runtime destroyed successfully"
        return 0
    else
        popd > /dev/null
        error "Failed to destroy AgentCore runtime"
        return 1
    fi
}

# Destroy AgentCore infrastructure Terraform module
# This must be destroyed AFTER runtime (reverse order of deployment)
# Requirement 6.2: Select the correct framework-specific workspace
destroy_agentcore_infra() {
    local use_case_id="$1"
    local framework_short="$2"
    local region="$3"
    
    local infra_path="$PROJECT_ROOT/applications/fsi_foundry/foundations/iac/agentcore/infra"
    local workspace_name
    workspace_name=$(get_workspace_name "$use_case_id" "$framework_short" "$region")
    
    info "Destroying AgentCore infrastructure..."
    info "  Workspace: $workspace_name"
    
    # Check if infra module exists
    if [[ ! -d "$infra_path" ]]; then
        warn "AgentCore infra module not found at applications/foundations/iac/agentcore/infra"
        return 0
    fi
    
    pushd "$infra_path" > /dev/null
    
    # Initialize Terraform if needed
    if [[ ! -d ".terraform" ]]; then
        info "Initializing Terraform for infra module..."
        if ! terraform init; then
            popd > /dev/null
            error "Terraform initialization failed for infra module"
            return 1
        fi
    fi
    
    # Check if workspace exists
    if ! terraform workspace list 2>/dev/null | grep -q "^[* ]*${workspace_name}$"; then
        info "Workspace '$workspace_name' does not exist for infra module. Skipping."
        popd > /dev/null
        return 0
    fi
    
    # Select the workspace
    if ! terraform workspace select "$workspace_name"; then
        popd > /dev/null
        error "Failed to select Terraform workspace '$workspace_name' for infra module"
        return 1
    fi
    
    # Get AWS account ID for the account_id variable
    local account_id
    account_id=$(get_aws_account_id)
    
    # Execute terraform destroy with required variables
    # Pass framework variable for framework-isolated resource naming
    if terraform destroy \
        -var "use_case_id=$use_case_id" \
        -var "aws_region=$region" \
        -var "framework=$FRAMEWORK" \
        -auto-approve; then
        
        # Switch to default workspace and delete the use case workspace
        terraform workspace select default 2>/dev/null || true
        terraform workspace delete "$workspace_name" 2>/dev/null || true
        
        popd > /dev/null
        success "AgentCore infrastructure destroyed successfully"
        return 0
    else
        popd > /dev/null
        error "Failed to destroy AgentCore infrastructure"
        return 1
    fi
}

# Clean up ECR images for the use case
cleanup_ecr_images() {
    local use_case_id="$1"
    local framework="$2"
    local region="$3"
    
    info "Checking for ECR images to clean up..."
    
    # Get the ECR repository name
    local repo_name
    repo_name=$(get_ecr_repository_name "$use_case_id" "$framework" "agentcore" 2>/dev/null || echo "")
    
    if [[ -z "$repo_name" ]]; then
        info "Could not determine ECR repository name, skipping ECR cleanup"
        return 0
    fi
    
    info "Looking for ECR repository: $repo_name"
    
    # Check if repository exists
    if ! aws ecr describe-repositories \
        --repository-names "$repo_name" \
        --region "$region" &>/dev/null; then
        info "ECR repository '$repo_name' not found (may already be deleted)"
        return 0
    fi
    
    # Count images in the repository
    local image_count
    image_count=$(aws ecr list-images \
        --repository-name "$repo_name" \
        --region "$region" \
        --query 'length(imageIds)' \
        --output text 2>/dev/null || echo "0")
    
    if [[ "$image_count" -gt 0 ]]; then
        echo ""
        echo -e "${YELLOW}Found $image_count image(s) in ECR repository: $repo_name${NC}"
        echo ""
        
        # Ask for confirmation unless SKIP_CONFIRMATION is set
        local should_cleanup="true"
        if [[ "${SKIP_CONFIRMATION:-false}" != "true" ]]; then
            if ! confirm "Do you want to delete these ECR images?"; then
                should_cleanup="false"
                info "ECR image cleanup skipped"
            fi
        fi
        
        if [[ "$should_cleanup" == "true" ]]; then
            info "Deleting ECR images..."
            
            # Get all image IDs
            local image_ids
            image_ids=$(aws ecr list-images \
                --repository-name "$repo_name" \
                --region "$region" \
                --query 'imageIds[*]' \
                --output json 2>/dev/null)
            
            if [[ -n "$image_ids" && "$image_ids" != "[]" ]]; then
                if aws ecr batch-delete-image \
                    --repository-name "$repo_name" \
                    --region "$region" \
                    --image-ids "$image_ids" &>/dev/null; then
                    success "ECR images deleted"
                else
                    warn "Could not delete some ECR images"
                fi
            fi
        fi
    else
        info "ECR repository is empty"
    fi
    
    return 0
}

# Clean up local Docker images for the use case
cleanup_local_docker_images() {
    local use_case_id="$1"
    local framework="$2"
    
    info "Checking for local Docker images to clean up..."
    
    # Get the image name for this use case
    local image_name
    image_name=$(get_image_name "$use_case_id" "$framework" "agentcore" 2>/dev/null || echo "")
    
    if [[ -z "$image_name" ]]; then
        info "Could not determine image name, skipping Docker cleanup"
        return 0
    fi
    
    # Check if Docker is available
    if ! command -v docker &> /dev/null || ! docker info &> /dev/null 2>&1; then
        info "Docker not available, skipping local image cleanup"
        return 0
    fi
    
    # Find and remove all tags of this image
    local images_to_remove
    images_to_remove=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^${image_name}:" 2>/dev/null || echo "")
    
    if [[ -n "$images_to_remove" ]]; then
        echo ""
        info "Found local Docker images to clean up:"
        echo "$images_to_remove" | while read -r img; do
            echo "  - $img"
        done
        echo ""
        
        # Ask for confirmation unless SKIP_CONFIRMATION is set
        local should_cleanup="true"
        if [[ "${SKIP_CONFIRMATION:-false}" != "true" ]]; then
            if ! confirm "Do you want to remove these local Docker images?"; then
                should_cleanup="false"
                info "Local Docker image cleanup skipped"
            fi
        fi
        
        if [[ "$should_cleanup" == "true" ]]; then
            echo "$images_to_remove" | while read -r img; do
                info "Removing: $img"
                docker rmi "$img" 2>/dev/null || warn "Could not remove $img"
            done
            success "Local Docker images cleaned up"
        fi
    else
        info "No local Docker images found for $image_name"
    fi
    
    return 0
}

# ============================================================================
# Main Cleanup Function
# ============================================================================

main() {
    section "AVA - AgentCore Cleanup"
    echo ""
    
    # ========================================================================
    # Step 1: Validate Required Variables
    # ========================================================================
    # Requirement 1.8: Validate that all required Global_Variables are set
    
    step "Step 1/7: Validating required variables..."
    
    if ! validate_required_vars; then
        die "Please set all required environment variables and try again."
    fi
    
    success "All required variables are set"
    show_deployment_summary
    
    # ========================================================================
    # Step 2: Check Prerequisites
    # ========================================================================
    
    step "Step 2/7: Checking prerequisites..."
    
    # Check required tools
    if ! check_prerequisites; then
        die "Missing required tools. Please install them and try again."
    fi
    
    # Verify AWS credentials
    if ! check_aws_credentials; then
        die "AWS credentials not configured. Please run: aws configure"
    fi
    
    # Get AWS account ID for display
    AWS_ACCOUNT_ID=$(get_aws_account_id)
    
    success "Prerequisites check passed"
    info "AWS Account: $AWS_ACCOUNT_ID"
    info "AWS Region: $AWS_REGION"
    echo ""
    
    # ========================================================================
    # Step 3: Confirmation
    # ========================================================================
    # Requirement 3.7: Only destroy resources associated with the specified use case workspace
    # Requirement 4.8: Provide cleanup scripts that destroy resources for a specific use case
    # Requirement 6.1: Target only resources matching the specific use case, framework, and pattern combination
    # Requirement 6.2: Select the correct framework-specific workspace
    
    step "Step 3/7: Confirming cleanup..."
    
    # Get framework short name for framework-specific workspace naming
    FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
    info "Framework short name: $FRAMEWORK_SHORT"
    
    WORKSPACE_NAME=$(get_workspace_name "$USE_CASE_ID" "$FRAMEWORK_SHORT" "$AWS_REGION")
    info "Target workspace: $WORKSPACE_NAME"
    
    echo ""
    echo -e "${YELLOW}WARNING: This will destroy the following resources:${NC}"
    echo ""
    echo "  • UI (CloudFront, S3, Lambda, DynamoDB, API Gateway)"
    echo "  • AgentCore runtime (CloudFormation stack)"
    echo "  • ECR repository and container images"
    echo "  • IAM roles and policies"
    echo "  • CloudWatch Log Groups"
    echo "  • S3 buckets (if created by Terraform)"
    echo ""
    echo -e "  ${BLUE}Use Case:${NC}   $USE_CASE_ID"
    echo -e "  ${BLUE}Framework:${NC}  $FRAMEWORK"
    echo -e "  ${BLUE}Region:${NC}     $AWS_REGION"
    echo -e "  ${BLUE}Workspace:${NC}  $WORKSPACE_NAME"
    echo ""
    
    # Ask for confirmation unless SKIP_CONFIRMATION is set
    if [[ "${SKIP_CONFIRMATION:-false}" != "true" ]]; then
        if ! confirm "Are you sure you want to destroy these resources?"; then
            info "Cleanup cancelled by user"
            return 0
        fi
    fi
    
    echo ""
    
    # ========================================================================
    # Step 4: Destroy UI (CloudFront, S3, Lambda, DynamoDB, API Gateway)
    # ========================================================================

    step "Step 4/7: Destroying UI resources..."

    if ! destroy_agentcore_ui "$USE_CASE_ID" "$FRAMEWORK_SHORT" "$AWS_REGION"; then
        warn "UI destruction encountered issues, continuing with runtime cleanup..."
    fi

    echo ""

    # ========================================================================
    # Step 5: Destroy AgentCore Runtime
    # ========================================================================
    # Runtime must be destroyed before infrastructure (reverse order of deployment)

    step "Step 5/7: Destroying AgentCore runtime..."

    if ! destroy_agentcore_runtime "$USE_CASE_ID" "$FRAMEWORK_SHORT" "$AWS_REGION"; then
        warn "Runtime destruction encountered issues, continuing with infrastructure cleanup..."
    fi

    echo ""

    # ========================================================================
    # Step 6: Destroy AgentCore Infrastructure
    # ========================================================================

    step "Step 6/7: Destroying AgentCore infrastructure..."

    if ! destroy_agentcore_infra "$USE_CASE_ID" "$FRAMEWORK_SHORT" "$AWS_REGION"; then
        warn "Infrastructure destruction encountered issues, continuing with cleanup..."
    fi

    echo ""

    # ========================================================================
    # Step 7: Clean Up ECR and Docker Images
    # ========================================================================

    step "Step 7/7: Cleaning up container images..."
    
    # Clean up ECR images
    cleanup_ecr_images "$USE_CASE_ID" "$FRAMEWORK" "$AWS_REGION"
    
    # Clean up local Docker images
    cleanup_local_docker_images "$USE_CASE_ID" "$FRAMEWORK"
    
    echo ""
    
    # ========================================================================
    # Cleanup Complete
    # ========================================================================
    
    section "Cleanup Complete!"
    echo ""
    echo -e "  ${GREEN}✓${NC} UI resources destroyed"
    echo -e "  ${GREEN}✓${NC} AgentCore runtime destroyed"
    echo -e "  ${GREEN}✓${NC} AgentCore infrastructure destroyed"
    echo -e "  ${GREEN}✓${NC} Terraform workspaces cleaned up"
    echo -e "  ${GREEN}✓${NC} Container images cleaned up"
    echo ""
    echo -e "  ${BLUE}Use Case:${NC}   $USE_CASE_ID"
    echo -e "  ${BLUE}Framework:${NC}  $FRAMEWORK"
    echo -e "  ${BLUE}Region:${NC}     $AWS_REGION"
    echo -e "  ${BLUE}Workspace:${NC}  $WORKSPACE_NAME"
    echo ""
    
    echo -e "${YELLOW}To verify all resources are deleted, run:${NC}"
    echo ""
    echo "  # Check CloudFormation stacks"
    # Requirement 6.4: Only target resources matching the framework-specific naming pattern
    echo "  aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \\"
    echo "    --query 'StackSummaries[?contains(StackName, \`ava-${USE_CASE_ID}-${FRAMEWORK_SHORT}\`)].StackName'"
    echo ""
    echo "  # Check ECR repositories"
    echo "  aws ecr describe-repositories \\"
    echo "    --query 'repositories[?contains(repositoryName, \`ava-${USE_CASE_ID}-${FRAMEWORK_SHORT}\`)].repositoryName'"
    echo ""
    echo "  # Check S3 buckets"
    echo "  aws s3 ls | grep fsi-${USE_CASE_ID}-${FRAMEWORK_SHORT}"
    echo ""
    
    return 0
}

# ============================================================================
# Script Entry Point
# ============================================================================

# Run main function
main "$@"
