#!/bin/bash

# ============================================================================
# AVA - Global Variables Module
# ============================================================================
# Standardized variable handling for the deployment pipeline including:
# - Canonical variable name definitions
# - Variable validation functions
# - Variable export functions
# - Framework short name mapping
#
# Usage: source "$PROJECT_ROOT/applications/scripts/lib/variables.sh"
#
# Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.8, 2.5
# ============================================================================

# Prevent multiple sourcing
if [[ -n "${_VARIABLES_SH_LOADED:-}" ]]; then
    return 0
fi
_VARIABLES_SH_LOADED=1

# Source common utilities if not already loaded
_VARIABLES_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${_COMMON_SH_LOADED:-}" ]]; then
    source "$_VARIABLES_SCRIPT_DIR/common.sh"
fi

# ============================================================================
# Canonical Variable Names
# ============================================================================
# These are the standard variable names used throughout the AVA.
# All scripts, Terraform modules, and Docker builds should use these names.
#
# Requirement 1.1: USE_CASE_ID as canonical name for use case identifiers
# Requirement 1.2: FRAMEWORK as canonical name for AI framework identifiers
# Requirement 1.3: DEPLOYMENT_PATTERN as canonical name for deployment patterns
# Requirement 1.4: AWS_REGION and AWS_PROFILE as canonical AWS config names

# Use case identifier (e.g., "kyc", "fraud_detection")
export USE_CASE_ID="${USE_CASE_ID:-}"

# AI framework identifier (e.g., "langchain_langgraph", "strands", "crewai")
export FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"

# Deployment pattern identifier (e.g., "ec2", "agentcore", "step_functions")
export DEPLOYMENT_PATTERN="${DEPLOYMENT_PATTERN:-}"

# AWS region for deployment (e.g., "us-west-2", "us-east-1")
export AWS_REGION="${AWS_REGION:-us-west-2}"

# AWS CLI profile to use (e.g., "default", "production")
export AWS_PROFILE="${AWS_PROFILE:-default}"

# ============================================================================
# Derived Variables
# ============================================================================
# Variables computed from the canonical variables above

# Terraform workspace name: {USE_CASE_ID}-{AWS_REGION}
# This is computed dynamically to ensure it reflects current variable values
get_workspace_name() {
    echo "${USE_CASE_ID}-${AWS_REGION}"
}

# Export WORKSPACE_NAME for convenience (updated when export_global_vars is called)
export WORKSPACE_NAME="${USE_CASE_ID:+${USE_CASE_ID}-${AWS_REGION}}"

# ============================================================================
# Framework Short Name Mapping
# ============================================================================
# Requirement 2.5: Provide FRAMEWORK_SHORT mapping for image naming
#
# Maps full framework names to short names used in Docker image tags.
# This keeps image names concise while remaining identifiable.

# Get the short name for a framework
# Usage: FRAMEWORK_SHORT=$(get_framework_short "$FRAMEWORK")
# 
# Arguments:
#   $1 - Framework identifier (e.g., "langchain_langgraph")
#
# Returns:
#   Short name for the framework (e.g., "langgraph")
get_framework_short() {
    local framework="$1"
    
    case "$framework" in
        langchain_langgraph)
            echo "langgraph"
            ;;
        strands)
            echo "strands"
            ;;
        crewai)
            echo "crewai"
            ;;
        llamaindex)
            echo "llamaindex"
            ;;
        *)
            # For unknown frameworks, return the original name
            echo "$framework"
            ;;
    esac
}

# ============================================================================
# Variable Validation
# ============================================================================
# Requirement 1.8: Validate that all required Global_Variables are set

# Validate that all required variables are set
# Usage: validate_required_vars || exit 1
#
# Returns:
#   0 if all required variables are set
#   1 if any required variables are missing (prints error with list)
#
# Required variables:
#   - USE_CASE_ID
#   - FRAMEWORK
#   - DEPLOYMENT_PATTERN
#   - AWS_REGION
validate_required_vars() {
    local missing=()
    
    # Check each required variable
    [[ -z "$USE_CASE_ID" ]] && missing+=("USE_CASE_ID")
    [[ -z "$FRAMEWORK" ]] && missing+=("FRAMEWORK")
    [[ -z "$DEPLOYMENT_PATTERN" ]] && missing+=("DEPLOYMENT_PATTERN")
    [[ -z "$AWS_REGION" ]] && missing+=("AWS_REGION")
    
    # Report missing variables if any
    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "Error: Missing required variables: ${missing[*]}"
        return 1
    fi
    
    return 0
}

# Get list of missing required variables (without printing error)
# Usage: MISSING=$(get_missing_vars)
#
# Returns:
#   Space-separated list of missing variable names, or empty string if all set
get_missing_vars() {
    local missing=()
    
    [[ -z "$USE_CASE_ID" ]] && missing+=("USE_CASE_ID")
    [[ -z "$FRAMEWORK" ]] && missing+=("FRAMEWORK")
    [[ -z "$DEPLOYMENT_PATTERN" ]] && missing+=("DEPLOYMENT_PATTERN")
    [[ -z "$AWS_REGION" ]] && missing+=("AWS_REGION")
    
    echo "${missing[*]}"
}

# ============================================================================
# Variable Export
# ============================================================================
# Requirement 1.5: Export all Global_Variables to child processes

# Export all global variables to child processes
# Usage: export_global_vars
#
# This function ensures all canonical variables are exported and
# updates derived variables based on current values.
export_global_vars() {
    # Export canonical variables
    export USE_CASE_ID
    export FRAMEWORK
    export DEPLOYMENT_PATTERN
    export AWS_REGION
    export AWS_PROFILE
    
    # Update and export derived variables
    export WORKSPACE_NAME="${USE_CASE_ID}-${AWS_REGION}"
    export FRAMEWORK_SHORT="$(get_framework_short "$FRAMEWORK")"
}

# ============================================================================
# Variable Display
# ============================================================================

# Display current variable values (for debugging/confirmation)
# Usage: show_variables
show_variables() {
    echo "Global Variables:"
    echo "  USE_CASE_ID:        ${USE_CASE_ID:-<not set>}"
    echo "  FRAMEWORK:          ${FRAMEWORK:-<not set>}"
    echo "  DEPLOYMENT_PATTERN: ${DEPLOYMENT_PATTERN:-<not set>}"
    echo "  AWS_REGION:         ${AWS_REGION:-<not set>}"
    echo "  AWS_PROFILE:        ${AWS_PROFILE:-<not set>}"
    echo ""
    echo "Derived Variables:"
    echo "  WORKSPACE_NAME:     ${USE_CASE_ID:+${USE_CASE_ID}-${AWS_REGION}}"
    echo "  FRAMEWORK_SHORT:    $(get_framework_short "${FRAMEWORK:-}")"
}

# ============================================================================
# Variable Setting Helpers
# ============================================================================

# Set a variable with validation
# Usage: set_use_case_id "kyc"
set_use_case_id() {
    local value="$1"
    if [[ -z "$value" ]]; then
        error "USE_CASE_ID cannot be empty"
        return 1
    fi
    export USE_CASE_ID="$value"
}

# Set framework with validation
# Usage: set_framework "langchain_langgraph"
set_framework() {
    local value="$1"
    if [[ -z "$value" ]]; then
        error "FRAMEWORK cannot be empty"
        return 1
    fi
    export FRAMEWORK="$value"
}

# Set deployment pattern with validation
# Usage: set_deployment_pattern "ec2"
set_deployment_pattern() {
    local value="$1"
    if [[ -z "$value" ]]; then
        error "DEPLOYMENT_PATTERN cannot be empty"
        return 1
    fi
    export DEPLOYMENT_PATTERN="$value"
}

# Set AWS region with validation
# Usage: set_aws_region "us-west-2"
set_aws_region() {
    local value="$1"
    if [[ -z "$value" ]]; then
        error "AWS_REGION cannot be empty"
        return 1
    fi
    export AWS_REGION="$value"
}

# Set AWS profile
# Usage: set_aws_profile "production"
set_aws_profile() {
    local value="$1"
    export AWS_PROFILE="${value:-default}"
}
