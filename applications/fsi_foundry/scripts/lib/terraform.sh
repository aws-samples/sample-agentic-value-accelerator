#!/bin/bash

# ============================================================================
# AVA - Terraform Module
# ============================================================================
# Functions for Terraform workspace management and state isolation including:
# - Workspace name generation following {USE_CASE_ID}-{FRAMEWORK_SHORT}-{AWS_REGION} convention
# - Local state file path construction
# - S3 backend key path construction
# - Workspace selection and creation
# - Terraform apply and destroy operations
# - Workspace listing for deployed use cases
#
# Usage: source "$PROJECT_ROOT/applications/scripts/lib/terraform.sh"
#
# Requirements: 1.1, 1.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
# ============================================================================

# Prevent multiple sourcing
if [[ -n "${_TERRAFORM_SH_LOADED:-}" ]]; then
    return 0
fi
_TERRAFORM_SH_LOADED=1

# Source dependencies if not already loaded
_TERRAFORM_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${_COMMON_SH_LOADED:-}" ]]; then
    source "$_TERRAFORM_SCRIPT_DIR/common.sh"
fi
if [[ -z "${_REGISTRY_SH_LOADED:-}" ]]; then
    source "$_TERRAFORM_SCRIPT_DIR/registry.sh"
fi

# ============================================================================
# Workspace Naming
# ============================================================================
# Requirement 1.1: Use Terraform workspaces with naming convention {USE_CASE_ID}-{FRAMEWORK_SHORT}-{AWS_REGION}
# Requirement 1.2: Include framework short name in workspace lookup

# Get the Terraform workspace name for a use case, framework, and region
# Usage: WORKSPACE=$(get_workspace_name "kyc_banking" "langgraph" "us-west-2")
#        WORKSPACE=$(get_workspace_name "B01" "langgraph" "us-west-2")
#
# Arguments:
#   $1 - Use case ID or use_case_name (e.g., "B01" or "kyc_banking")
#   $2 - Framework short name (e.g., "langgraph", "strands")
#   $3 - AWS region (e.g., "us-west-2")
#
# Returns:
#   Workspace name following convention {ID}-{FRAMEWORK_SHORT}-{AWS_REGION}
#   Uses lowercase ID for consistency (e.g., "b01-langgraph-us-west-2")
get_workspace_name() {
    local identifier="$1"
    local framework_short="$2"
    local region="$3"

    if [[ -z "$identifier" ]]; then
        error "Use case identifier is required for workspace name generation"
        return 1
    fi

    if [[ -z "$framework_short" ]]; then
        error "FRAMEWORK_SHORT is required for workspace name generation"
        return 1
    fi

    if [[ -z "$region" ]]; then
        error "AWS_REGION is required for workspace name generation"
        return 1
    fi

    # Normalize to canonical ID for resource naming
    local resource_id
    resource_id=$(normalize_use_case_to_id "$identifier")

    # Convert to lowercase for consistency
    resource_id=$(echo "$resource_id" | tr '[:upper:]' '[:lower:]')

    echo "${resource_id}-${framework_short}-${region}"
}

# ============================================================================
# State Path Construction
# ============================================================================
# Requirement 3.3: Store local Terraform state in applications/foundations/iac/{DEPLOYMENT_PATTERN}/terraform.tfstate.d/{USE_CASE_ID}-{FRAMEWORK_SHORT}-{AWS_REGION}/
# Requirement 1.1: Include framework short name in state path construction

# Get the local state file path for a deployment
# Usage: STATE_PATH=$(get_state_path "ec2" "kyc_banking" "langgraph" "us-west-2")
#        STATE_PATH=$(get_state_path "ec2" "B01" "langgraph" "us-west-2")
#
# Arguments:
#   $1 - Deployment pattern (e.g., "ec2", "agentcore", "step_functions")
#   $2 - Use case ID or use_case_name (e.g., "B01" or "kyc_banking")
#   $3 - Framework short name (e.g., "langgraph", "strands")
#   $4 - AWS region (e.g., "us-west-2")
#
# Returns:
#   Path to local state file relative to PROJECT_ROOT
get_state_path() {
    local pattern="$1"
    local identifier="$2"
    local framework_short="$3"
    local region="$4"

    if [[ -z "$pattern" ]]; then
        error "DEPLOYMENT_PATTERN is required for state path construction"
        return 1
    fi

    if [[ -z "$identifier" ]]; then
        error "Use case identifier is required for state path construction"
        return 1
    fi

    if [[ -z "$framework_short" ]]; then
        error "FRAMEWORK_SHORT is required for state path construction"
        return 1
    fi

    if [[ -z "$region" ]]; then
        error "AWS_REGION is required for state path construction"
        return 1
    fi

    local workspace_name
    workspace_name=$(get_workspace_name "$identifier" "$framework_short" "$region") || return 1

    echo "applications/fsi_foundry/foundations/iac/${pattern}/terraform.tfstate.d/${workspace_name}/terraform.tfstate"
}

# ============================================================================
# S3 Backend Key Path
# ============================================================================
# Requirement 3.4: Support S3 backend with key path {USE_CASE_ID}/{FRAMEWORK_SHORT}/{DEPLOYMENT_PATTERN}/{AWS_REGION}/terraform.tfstate
# Requirement 1.1: Include framework short name in S3 key path construction

# Get the S3 backend key path for a deployment
# Usage: S3_KEY=$(get_s3_key "kyc_banking" "langgraph" "ec2" "us-west-2")
#        S3_KEY=$(get_s3_key "B01" "langgraph" "ec2" "us-west-2")
#
# Arguments:
#   $1 - Use case ID or use_case_name (e.g., "B01" or "kyc_banking")
#   $2 - Framework short name (e.g., "langgraph", "strands")
#   $3 - Deployment pattern (e.g., "ec2")
#   $4 - AWS region (e.g., "us-west-2")
#
# Returns:
#   S3 key path for Terraform state using canonical ID
get_s3_key() {
    local identifier="$1"
    local framework_short="$2"
    local pattern="$3"
    local region="$4"

    if [[ -z "$identifier" ]]; then
        error "Use case identifier is required for S3 key path construction"
        return 1
    fi

    if [[ -z "$framework_short" ]]; then
        error "FRAMEWORK_SHORT is required for S3 key path construction"
        return 1
    fi

    if [[ -z "$pattern" ]]; then
        error "DEPLOYMENT_PATTERN is required for S3 key path construction"
        return 1
    fi

    if [[ -z "$region" ]]; then
        error "AWS_REGION is required for S3 key path construction"
        return 1
    fi

    # Normalize to canonical ID for resource naming
    local resource_id
    resource_id=$(normalize_use_case_to_id "$identifier")

    # Convert to lowercase for consistency
    resource_id=$(echo "$resource_id" | tr '[:upper:]' '[:lower:]')

    echo "${resource_id}/${framework_short}/${pattern}/${region}/terraform.tfstate"
}

# ============================================================================
# IAC Path Resolution
# ============================================================================

# Get the Terraform module path for a deployment pattern
# Usage: IAC_PATH=$(get_iac_path "ec2")
#
# Arguments:
#   $1 - Deployment pattern (e.g., "ec2", "agentcore", "step_functions")
#
# Returns:
#   Path to Terraform module relative to PROJECT_ROOT
get_iac_path() {
    local pattern="$1"
    
    if [[ -z "$pattern" ]]; then
        error "DEPLOYMENT_PATTERN is required for IAC path resolution"
        return 1
    fi
    
    # First try to get the path from the registry
    local registry_path
    registry_path=$(get_pattern_iac_path "$pattern" 2>/dev/null)
    
    if [[ -n "$registry_path" && "$registry_path" != "null" ]]; then
        echo "$registry_path"
    else
        # Fall back to standard path convention
        echo "applications/fsi_foundry/foundations/iac/${pattern}"
    fi
}

# Validate that the IAC path exists
# Usage: validate_iac_path_exists "ec2" || exit 1
#
# Arguments:
#   $1 - Deployment pattern
#
# Returns:
#   0 if IAC path exists
#   1 if IAC path not found (prints error message)
validate_iac_path_exists() {
    local pattern="$1"
    
    local iac_path
    iac_path=$(get_iac_path "$pattern") || return 1
    
    local full_path="$PROJECT_ROOT/$iac_path"
    
    if [[ ! -d "$full_path" ]]; then
        error "Terraform module not found at $iac_path"
        return 1
    fi
    
    return 0
}

# ============================================================================
# Workspace Management
# ============================================================================
# Requirement 3.2: Automatically select or create the appropriate Terraform workspace
# Requirement 1.2: Include framework short name in workspace lookup

# Select or create a Terraform workspace with framework isolation
# Usage: select_or_create_workspace "kyc_banking" "langgraph" "us-west-2" "ec2"
#
# Arguments:
#   $1 - Use case ID (e.g., "kyc_banking")
#   $2 - Framework short name (e.g., "langgraph", "strands")
#   $3 - AWS region (e.g., "us-west-2")
#   $4 - Deployment pattern (e.g., "ec2")
#
# Returns:
#   0 on success (workspace selected or created)
#   1 on failure (prints error message)
select_or_create_workspace() {
    local use_case_id="$1"
    local framework_short="$2"
    local region="$3"
    local pattern="$4"
    
    if [[ -z "$use_case_id" ]]; then
        error "USE_CASE_ID is required for workspace selection"
        return 1
    fi
    
    if [[ -z "$framework_short" ]]; then
        error "FRAMEWORK_SHORT is required for workspace selection"
        return 1
    fi
    
    if [[ -z "$region" ]]; then
        error "AWS_REGION is required for workspace selection"
        return 1
    fi
    
    if [[ -z "$pattern" ]]; then
        error "DEPLOYMENT_PATTERN is required for workspace selection"
        return 1
    fi
    
    # Get workspace name with framework isolation
    local workspace_name
    workspace_name=$(get_workspace_name "$use_case_id" "$framework_short" "$region") || return 1
    
    # Get IAC path
    local iac_path
    iac_path=$(get_iac_path "$pattern") || return 1
    
    local full_iac_path="$PROJECT_ROOT/$iac_path"
    
    # Validate IAC path exists
    if [[ ! -d "$full_iac_path" ]]; then
        error "Terraform module not found at $iac_path"
        return 1
    fi
    
    info "Selecting Terraform workspace: $workspace_name"
    info "  IAC Path: $iac_path"
    
    # Change to IAC directory
    pushd "$full_iac_path" > /dev/null || {
        error "Failed to change to directory: $full_iac_path"
        return 1
    }
    
    # Initialize Terraform if needed
    if [[ ! -d ".terraform" ]]; then
        info "Initializing Terraform..."
        if ! terraform init; then
            error "Terraform initialization failed"
            popd > /dev/null
            return 1
        fi
    fi
    
    # Check if workspace exists and select or create it
    if terraform workspace list 2>/dev/null | grep -q "^[* ]*${workspace_name}$"; then
        info "Selecting existing workspace: $workspace_name"
        if ! terraform workspace select "$workspace_name"; then
            error "Failed to select Terraform workspace '$workspace_name'"
            popd > /dev/null
            return 1
        fi
    else
        info "Creating new workspace: $workspace_name"
        if ! terraform workspace new "$workspace_name"; then
            error "Failed to create Terraform workspace '$workspace_name'"
            popd > /dev/null
            return 1
        fi
    fi
    
    popd > /dev/null
    
    success "Workspace selected: $workspace_name"
    return 0
}

# ============================================================================
# Terraform Apply
# ============================================================================
# Requirement 1.6: Pass Global_Variables as Terraform variables via -var flags
# Requirement 3.6: Include USE_CASE_ID in resource naming

# Apply Terraform configuration with proper variable passing
# Usage: apply_terraform "kyc_banking" "langgraph" "us-west-2" "ec2" [additional_vars...]
#
# Arguments:
#   $1 - Use case ID (e.g., "kyc_banking")
#   $2 - Framework short name (e.g., "langgraph", "strands")
#   $3 - AWS region (e.g., "us-west-2")
#   $4 - Deployment pattern (e.g., "ec2")
#   $5+ - Additional -var arguments (optional)
#
# Returns:
#   0 on success
#   1 on failure (prints error message)
apply_terraform() {
    local use_case_id="$1"
    local framework_short="$2"
    local region="$3"
    local pattern="$4"
    shift 4
    local additional_vars=("$@")
    
    if [[ -z "$use_case_id" ]]; then
        error "USE_CASE_ID is required for Terraform apply"
        return 1
    fi
    
    if [[ -z "$framework_short" ]]; then
        error "FRAMEWORK_SHORT is required for Terraform apply"
        return 1
    fi
    
    if [[ -z "$region" ]]; then
        error "AWS_REGION is required for Terraform apply"
        return 1
    fi
    
    if [[ -z "$pattern" ]]; then
        error "DEPLOYMENT_PATTERN is required for Terraform apply"
        return 1
    fi
    
    # Get IAC path
    local iac_path
    iac_path=$(get_iac_path "$pattern") || return 1
    
    local full_iac_path="$PROJECT_ROOT/$iac_path"
    
    # Validate IAC path exists
    if [[ ! -d "$full_iac_path" ]]; then
        error "Terraform module not found at $iac_path"
        return 1
    fi
    
    # Select or create workspace first with framework isolation
    select_or_create_workspace "$use_case_id" "$framework_short" "$region" "$pattern" || return 1
    
    info "Applying Terraform configuration..."
    info "  Use Case: $use_case_id"
    info "  Framework: $framework_short"
    info "  Region: $region"
    info "  Pattern: $pattern"
    
    # Change to IAC directory
    pushd "$full_iac_path" > /dev/null || {
        error "Failed to change to directory: $full_iac_path"
        return 1
    }
    
    # Build terraform apply command with variables
    # Normalize use_case_id to canonical ID for resource naming
    local resource_id
    resource_id=$(normalize_use_case_to_id "$use_case_id")

    local tf_cmd=(terraform apply -auto-approve)
    tf_cmd+=(-var "use_case_id=$resource_id")
    tf_cmd+=(-var "use_case_name=$use_case_id")
    tf_cmd+=(-var "aws_region=$region")

    # Add any additional variables
    for var in "${additional_vars[@]}"; do
        tf_cmd+=(-var "$var")
    done

    # Execute terraform apply
    if "${tf_cmd[@]}"; then
        popd > /dev/null
        success "Terraform apply completed successfully"
        return 0
    else
        popd > /dev/null
        error "Terraform apply failed. Check the output above."
        return 1
    fi
}

# ============================================================================
# Terraform Destroy
# ============================================================================
# Requirement 3.7: Only destroy resources associated with the specified use case workspace
# Requirement 6.2: Select the correct framework-specific workspace when destroying

# Destroy Terraform resources for a specific use case workspace
# Usage: destroy_terraform "kyc_banking" "langgraph" "us-west-2" "ec2"
#
# Arguments:
#   $1 - Use case ID (e.g., "kyc_banking")
#   $2 - Framework short name (e.g., "langgraph", "strands")
#   $3 - AWS region (e.g., "us-west-2")
#   $4 - Deployment pattern (e.g., "ec2")
#
# Returns:
#   0 on success
#   1 on failure (prints error message)
destroy_terraform() {
    local use_case_id="$1"
    local framework_short="$2"
    local region="$3"
    local pattern="$4"
    
    if [[ -z "$use_case_id" ]]; then
        error "USE_CASE_ID is required for Terraform destroy"
        return 1
    fi
    
    if [[ -z "$framework_short" ]]; then
        error "FRAMEWORK_SHORT is required for Terraform destroy"
        return 1
    fi
    
    if [[ -z "$region" ]]; then
        error "AWS_REGION is required for Terraform destroy"
        return 1
    fi
    
    if [[ -z "$pattern" ]]; then
        error "DEPLOYMENT_PATTERN is required for Terraform destroy"
        return 1
    fi
    
    # Get workspace name with framework isolation
    local workspace_name
    workspace_name=$(get_workspace_name "$use_case_id" "$framework_short" "$region") || return 1
    
    # Get IAC path
    local iac_path
    iac_path=$(get_iac_path "$pattern") || return 1
    
    local full_iac_path="$PROJECT_ROOT/$iac_path"
    
    # Validate IAC path exists
    if [[ ! -d "$full_iac_path" ]]; then
        error "Terraform module not found at $iac_path"
        return 1
    fi
    
    info "Destroying Terraform resources..."
    info "  Use Case: $use_case_id"
    info "  Framework: $framework_short"
    info "  Region: $region"
    info "  Pattern: $pattern"
    info "  Workspace: $workspace_name"
    
    # Change to IAC directory
    pushd "$full_iac_path" > /dev/null || {
        error "Failed to change to directory: $full_iac_path"
        return 1
    }
    
    # Initialize Terraform if needed
    if [[ ! -d ".terraform" ]]; then
        info "Initializing Terraform..."
        if ! terraform init; then
            error "Terraform initialization failed"
            popd > /dev/null
            return 1
        fi
    fi
    
    # Check if workspace exists
    if ! terraform workspace list 2>/dev/null | grep -q "^[* ]*${workspace_name}$"; then
        warn "Workspace '$workspace_name' does not exist. Nothing to destroy."
        popd > /dev/null
        return 0
    fi
    
    # Select the workspace
    if ! terraform workspace select "$workspace_name"; then
        error "Failed to select Terraform workspace '$workspace_name'"
        popd > /dev/null
        return 1
    fi
    
    # Normalize use_case_id to canonical ID for resource naming
    local resource_id
    resource_id=$(normalize_use_case_to_id "$use_case_id")

    # Execute terraform destroy
    if terraform destroy \
        -var "use_case_id=$resource_id" \
        -var "use_case_name=$use_case_id" \
        -var "aws_region=$region" \
        -auto-approve; then
        
        # Optionally delete the workspace after destroy
        # Switch to default workspace first
        terraform workspace select default 2>/dev/null || true
        
        # Delete the workspace
        if terraform workspace delete "$workspace_name" 2>/dev/null; then
            info "Workspace '$workspace_name' deleted"
        fi
        
        popd > /dev/null
        success "Terraform destroy completed successfully"
        return 0
    else
        popd > /dev/null
        error "Terraform destroy failed. Check the output above."
        return 1
    fi
}

# ============================================================================
# Workspace Listing
# ============================================================================
# Requirement 3.8: Provide a mechanism to list all deployed use case workspaces

# List all Terraform workspaces for a deployment pattern
# Usage: list_workspaces "ec2"
#
# Arguments:
#   $1 - Deployment pattern (e.g., "ec2", "agentcore", "step_functions")
#
# Returns:
#   Newline-separated list of workspace names (excluding "default")
list_workspaces() {
    local pattern="$1"
    
    if [[ -z "$pattern" ]]; then
        error "DEPLOYMENT_PATTERN is required for listing workspaces"
        return 1
    fi
    
    # Get IAC path
    local iac_path
    iac_path=$(get_iac_path "$pattern") || return 1
    
    local full_iac_path="$PROJECT_ROOT/$iac_path"
    
    # Validate IAC path exists
    if [[ ! -d "$full_iac_path" ]]; then
        error "Terraform module not found at $iac_path"
        return 1
    fi
    
    # Change to IAC directory
    pushd "$full_iac_path" > /dev/null || {
        error "Failed to change to directory: $full_iac_path"
        return 1
    }
    
    # Initialize Terraform if needed
    if [[ ! -d ".terraform" ]]; then
        info "Initializing Terraform..."
        if ! terraform init -backend=false > /dev/null 2>&1; then
            # Try without backend config
            terraform init > /dev/null 2>&1 || true
        fi
    fi
    
    # List workspaces, excluding "default" and cleaning up output
    terraform workspace list 2>/dev/null | \
        grep -v "^[* ]*default$" | \
        sed 's/^[* ]*//' | \
        grep -v "^$"
    
    popd > /dev/null
    return 0
}

# List all workspaces across all deployment patterns
# Usage: list_all_workspaces
#
# Returns:
#   Formatted list of all workspaces grouped by pattern
list_all_workspaces() {
    local patterns
    patterns=$(get_all_pattern_ids 2>/dev/null)
    
    if [[ -z "$patterns" ]]; then
        # Fall back to known patterns
        patterns="ec2 agentcore step_functions"
    fi
    
    for pattern in $patterns; do
        local iac_path
        iac_path=$(get_iac_path "$pattern" 2>/dev/null) || continue
        
        if [[ -d "$PROJECT_ROOT/$iac_path" ]]; then
            local workspaces
            workspaces=$(list_workspaces "$pattern" 2>/dev/null)
            
            if [[ -n "$workspaces" ]]; then
                echo "Pattern: $pattern"
                echo "$workspaces" | while read -r ws; do
                    echo "  - $ws"
                done
                echo ""
            fi
        fi
    done
}

# ============================================================================
# State Verification
# ============================================================================

# Check if Terraform state exists for a deployment
# Usage: if terraform_state_exists "kyc_banking" "langgraph" "us-west-2" "ec2"; then ...
#
# Arguments:
#   $1 - Use case ID
#   $2 - Framework short name
#   $3 - AWS region
#   $4 - Deployment pattern
#
# Returns:
#   0 if state exists
#   1 if state does not exist
terraform_state_exists() {
    local use_case_id="$1"
    local framework_short="$2"
    local region="$3"
    local pattern="$4"
    
    local state_path
    state_path=$(get_state_path "$pattern" "$use_case_id" "$framework_short" "$region") || return 1
    
    local full_state_path="$PROJECT_ROOT/$state_path"
    
    [[ -f "$full_state_path" ]]
}

# Get the current workspace for a deployment pattern
# Usage: CURRENT_WS=$(get_current_workspace "ec2")
#
# Arguments:
#   $1 - Deployment pattern
#
# Returns:
#   Current workspace name
get_current_workspace() {
    local pattern="$1"
    
    local iac_path
    iac_path=$(get_iac_path "$pattern") || return 1
    
    local full_iac_path="$PROJECT_ROOT/$iac_path"
    
    if [[ ! -d "$full_iac_path" ]]; then
        return 1
    fi
    
    pushd "$full_iac_path" > /dev/null || return 1
    
    local current
    current=$(terraform workspace show 2>/dev/null)
    
    popd > /dev/null
    
    echo "$current"
}

# ============================================================================
# Terraform Output
# ============================================================================

# Get Terraform outputs for a deployment
# Usage: OUTPUTS=$(get_terraform_outputs "kyc_banking" "langgraph" "us-west-2" "ec2")
#
# Arguments:
#   $1 - Use case ID (e.g., "kyc_banking")
#   $2 - Framework short name (e.g., "langgraph", "strands")
#   $3 - AWS region (e.g., "us-west-2")
#   $4 - Deployment pattern (e.g., "ec2")
#
# Returns:
#   JSON object of Terraform outputs
get_terraform_outputs() {
    local use_case_id="$1"
    local framework_short="$2"
    local region="$3"
    local pattern="$4"
    
    # Get IAC path
    local iac_path
    iac_path=$(get_iac_path "$pattern") || return 1
    
    local full_iac_path="$PROJECT_ROOT/$iac_path"
    
    if [[ ! -d "$full_iac_path" ]]; then
        error "Terraform module not found at $iac_path"
        return 1
    fi
    
    # Select workspace first with framework isolation
    select_or_create_workspace "$use_case_id" "$framework_short" "$region" "$pattern" || return 1
    
    pushd "$full_iac_path" > /dev/null || return 1
    
    terraform output -json 2>/dev/null
    
    popd > /dev/null
}

# Get a specific Terraform output value
# Usage: VALUE=$(get_terraform_output "kyc_banking" "langgraph" "us-west-2" "ec2" "instance_public_ip")
#
# Arguments:
#   $1 - Use case ID (e.g., "kyc_banking")
#   $2 - Framework short name (e.g., "langgraph", "strands")
#   $3 - AWS region (e.g., "us-west-2")
#   $4 - Deployment pattern (e.g., "ec2")
#   $5 - Output name
#
# Returns:
#   Output value
get_terraform_output() {
    local use_case_id="$1"
    local framework_short="$2"
    local region="$3"
    local pattern="$4"
    local output_name="$5"
    
    # Get IAC path
    local iac_path
    iac_path=$(get_iac_path "$pattern") || return 1
    
    local full_iac_path="$PROJECT_ROOT/$iac_path"
    
    if [[ ! -d "$full_iac_path" ]]; then
        error "Terraform module not found at $iac_path"
        return 1
    fi
    
    # Select workspace first with framework isolation
    select_or_create_workspace "$use_case_id" "$framework_short" "$region" "$pattern" || return 1
    
    pushd "$full_iac_path" > /dev/null || return 1
    
    terraform output -raw "$output_name" 2>/dev/null
    
    popd > /dev/null
}


# ============================================================================
# Framework Combination Listing
# ============================================================================
# Requirement 6.3: Provide a mechanism to list all deployed framework combinations
# Requirement 1.4: Parse workspace names to extract framework identifiers

# List all deployed framework combinations for a use case
# Usage: list_deployed_framework_combinations "kyc_banking" "ec2"
#
# Arguments:
#   $1 - Use case ID (e.g., "kyc_banking")
#   $2 - Deployment pattern (e.g., "ec2", "agentcore", "step_functions")
#
# Returns:
#   Newline-separated list of framework short names deployed for this use case
#   Format: framework_short region (e.g., "langgraph us-west-2")
list_deployed_framework_combinations() {
    local use_case_id="$1"
    local pattern="$2"
    
    if [[ -z "$use_case_id" ]]; then
        error "USE_CASE_ID is required for listing framework combinations"
        return 1
    fi
    
    if [[ -z "$pattern" ]]; then
        error "DEPLOYMENT_PATTERN is required for listing framework combinations"
        return 1
    fi
    
    # Get all workspaces for this pattern
    local workspaces
    workspaces=$(list_workspaces "$pattern" 2>/dev/null) || return 1
    
    if [[ -z "$workspaces" ]]; then
        return 0
    fi
    
    # Filter workspaces that match the use case and parse framework/region
    # Workspace format: {USE_CASE_ID}-{FRAMEWORK_SHORT}-{AWS_REGION}
    echo "$workspaces" | while read -r ws; do
        # Check if workspace starts with the use case ID
        if [[ "$ws" == "${use_case_id}-"* ]]; then
            # Extract framework and region from workspace name
            # Remove use_case_id prefix
            local remainder="${ws#${use_case_id}-}"
            
            # Parse framework_short and region
            # Format: framework_short-region (e.g., langgraph-us-west-2)
            # Region always has format: xx-xxxx-N (e.g., us-west-2, eu-central-1)
            # So we need to find the last occurrence of a region pattern
            
            # Use regex to extract framework and region
            if [[ "$remainder" =~ ^([a-z]+)-([a-z]+-[a-z]+-[0-9]+)$ ]]; then
                local framework_short="${BASH_REMATCH[1]}"
                local region="${BASH_REMATCH[2]}"
                echo "$framework_short $region"
            fi
        fi
    done
}

# List all deployed use case/framework/region combinations across all patterns
# Usage: list_all_deployed_combinations
#
# Returns:
#   Formatted list of all deployed combinations grouped by pattern
list_all_deployed_combinations() {
    local patterns
    patterns=$(get_all_pattern_ids 2>/dev/null)
    
    if [[ -z "$patterns" ]]; then
        # Fall back to known patterns
        patterns="ec2 agentcore step_functions"
    fi
    
    for pattern in $patterns; do
        local iac_path
        iac_path=$(get_iac_path "$pattern" 2>/dev/null) || continue
        
        if [[ -d "$PROJECT_ROOT/$iac_path" ]]; then
            local workspaces
            workspaces=$(list_workspaces "$pattern" 2>/dev/null)
            
            if [[ -n "$workspaces" ]]; then
                echo "Pattern: $pattern"
                echo "$workspaces" | while read -r ws; do
                    # Parse workspace name: {USE_CASE_ID}-{FRAMEWORK_SHORT}-{AWS_REGION}
                    # Extract components using regex
                    if [[ "$ws" =~ ^(.+)-([a-z]+)-([a-z]+-[a-z]+-[0-9]+)$ ]]; then
                        local use_case="${BASH_REMATCH[1]}"
                        local framework="${BASH_REMATCH[2]}"
                        local region="${BASH_REMATCH[3]}"
                        echo "  - Use Case: $use_case, Framework: $framework, Region: $region"
                    else
                        echo "  - $ws (unparsed)"
                    fi
                done
                echo ""
            fi
        fi
    done
}
