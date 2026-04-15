#!/bin/bash

# ============================================================================
# AVA - Interactive Deployment CLI
# ============================================================================
# Developer interface for deploying AI agent use cases.
# Guides through: (1) Use Case → (2) Framework → (3) Deployment Pattern → (4) Region
#
# This script uses the shared library modules for consistent behavior and
# calls generic deployment scripts that work with any registered use case.
#
# Usage: 
#   ./deploy.sh              # Interactive mode
#   ./deploy.sh --help       # Show help
#   ./deploy.sh --region us-east-1 --app-only  # Options
#
# Requirements: 1.5, 4.2
# ============================================================================

set -e

# ============================================================================
# Script Initialization
# ============================================================================

# Resolve script location and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

# ============================================================================
# Source Library Modules
# ============================================================================
# Source all shared library modules for consistent behavior across scripts
# Requirement 1.5: Export all Global_Variables to child processes

# Source common utilities (colors, error handling, path resolution)
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/common.sh"

# Source global variables module (validation, export functions)
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/variables.sh"

# Source registry module (use case, framework, pattern validation)
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"

# ============================================================================
# Default Values
# ============================================================================

# AWS_REGION is already set with default in variables.sh
APP_ONLY=false

# ============================================================================
# Help and Banner Functions
# ============================================================================

# Show the AVA banner (uses common.sh function)
# show_banner is already defined in common.sh

# Show help
show_help() {
    show_banner
    echo "Usage: ./deploy.sh [options]"
    echo ""
    echo "Options:"
    echo "  --region <region>   AWS region (default: us-west-2)"
    echo "  --app-only          Deploy application only (skip infrastructure)"
    echo "  --help              Show this help message"
    echo ""
    echo "Interactive mode guides you through:"
    echo "  1. Select a use case from the registry"
    echo "  2. Select an AI framework"
    echo "  3. Select a deployment pattern"
    echo "  4. Select an AWS region"
    echo ""
    echo "Environment Variables:"
    echo "  USE_CASE_ID         Pre-select use case (skip menu)"
    echo "  FRAMEWORK           Pre-select framework (skip menu)"
    echo "  DEPLOYMENT_PATTERN  Pre-select deployment pattern (skip menu)"
    echo "  AWS_REGION          Pre-select region (skip menu)"
    echo "  AWS_PROFILE         AWS CLI profile to use (default: default)"
    echo ""
}

# ============================================================================
# Menu Selection Functions
# ============================================================================

# Read menu selection with validation
# Usage: selection=$(read_selection "Select [1-5]:" 5)
read_selection() {
    local prompt="$1"
    local max="$2"
    local selection
    
    # If only one option, auto-select it
    if [ "$max" -eq 1 ]; then
        echo "1"
        return 0
    fi
    
    while true; do
        echo -ne "${YELLOW}$prompt${NC} " >&2
        read -r selection
        
        if [[ "$selection" =~ ^[0-9]+$ ]] && [ "$selection" -ge 1 ] && [ "$selection" -le "$max" ]; then
            echo "$selection"
            return 0
        else
            echo -e "${RED}Invalid selection. Please enter a number between 1 and $max${NC}" >&2
        fi
    done
}

# ============================================================================
# Step 1: Select Use Case
# ============================================================================
# Requirement 4.2: Read available use cases from the Registry

select_use_case() {
    section "STEP 1: Select Use Case"
    echo ""
    
    local count=1
    local use_cases=()
    
    # Read use cases from registry using registry module
    while IFS= read -r use_case_id; do
        local name
        local desc
        name=$(jq -r ".use_cases[] | select(.id==\"$use_case_id\") | .name" "$REGISTRY_FILE")
        desc=$(jq -r ".use_cases[] | select(.id==\"$use_case_id\") | .description" "$REGISTRY_FILE")
        
        use_cases+=("$use_case_id")
        echo -e "  ${BOLD}[$count]${NC} ${CYAN}$name${NC} ($use_case_id)"
        echo -e "      ${DIM}$desc${NC}"
        echo ""
        ((count++))
    done < <(get_all_use_case_ids)
    
    if [ ${#use_cases[@]} -eq 0 ]; then
        die "No use cases found in registry"
    fi
    
    local selection
    selection=$(read_selection "Select use case [1-$((count-1))]:" "$((count-1))")
    
    # Set canonical variable name (Requirement 1.1)
    # Resolve use_case_name (e.g. "credit_risk") from the short ID (e.g. "R03")
    # because directory paths and deploy scripts expect use_case_name
    local selected_id="${use_cases[$((selection-1))]}"
    USE_CASE_ID=$(get_use_case_name_field "$selected_id")
    export USE_CASE_ID

    local selected_name
    selected_name=$(get_use_case_name "$selected_id")

    echo ""
    success "Selected: $selected_name ($selected_id)"
    echo ""
}

# ============================================================================
# Step 2: Select Framework
# ============================================================================
# Requirement 4.2: Read available frameworks from the Registry
# Requirement 4.3: Validate that the selected framework is supported

select_framework() {
    section "STEP 2: Select AI Framework"
    echo ""
    
    # Get supported frameworks for selected use case
    local supported_frameworks
    supported_frameworks=$(get_supported_frameworks "$USE_CASE_ID")
    
    local count=1
    local frameworks=()
    
    # Read all frameworks from registry
    while IFS= read -r framework_id; do
        local name
        local desc
        name=$(jq -r ".frameworks[] | select(.id==\"$framework_id\") | .name" "$REGISTRY_FILE")
        desc=$(jq -r ".frameworks[] | select(.id==\"$framework_id\") | .description" "$REGISTRY_FILE")
        
        # Check if framework is supported for this use case
        if echo "$supported_frameworks" | grep -q "^$framework_id$"; then
            frameworks+=("$framework_id")
            echo -e "  ${BOLD}[$count]${NC} ${CYAN}$name${NC}"
            echo -e "      ${DIM}$desc${NC}"
            echo ""
            ((count++))
        else
            echo -e "  ${DIM}[-] $name (not available for this use case)${NC}"
            echo ""
        fi
    done < <(get_all_framework_ids)
    
    if [ ${#frameworks[@]} -eq 0 ]; then
        die "No frameworks available for use case '$USE_CASE_ID'"
    fi
    
    local selection
    selection=$(read_selection "Select framework [1-$((count-1))]:" "$((count-1))")
    
    # Set canonical variable name (Requirement 1.2)
    FRAMEWORK="${frameworks[$((selection-1))]}"
    export FRAMEWORK
    
    local selected_name
    selected_name=$(jq -r ".frameworks[] | select(.id==\"$FRAMEWORK\") | .name" "$REGISTRY_FILE")
    
    echo ""
    success "Selected: $selected_name"
    echo ""
}

# ============================================================================
# Step 3: Select Deployment Pattern
# ============================================================================
# Requirement 4.2: Read available patterns from the Registry
# Requirement 4.3: Validate that the selected pattern is supported

select_pattern() {
    section "STEP 3: Select Deployment Pattern"
    echo ""
    
    # Get supported patterns for selected use case
    local supported_patterns
    supported_patterns=$(get_supported_patterns "$USE_CASE_ID")
    
    local count=1
    local patterns=()
    local pattern_ids=()
    
    # Read all deployment patterns from registry
    while IFS= read -r pattern_id; do
        local name
        local desc
        name=$(jq -r ".deployment_patterns[] | select(.id==\"$pattern_id\") | .name" "$REGISTRY_FILE")
        desc=$(jq -r ".deployment_patterns[] | select(.id==\"$pattern_id\") | .description" "$REGISTRY_FILE")
        
        # Check if pattern is supported for this use case
        if echo "$supported_patterns" | grep -q "^$pattern_id$"; then
            patterns+=("$name")
            pattern_ids+=("$pattern_id")
            echo -e "  ${BOLD}[$count]${NC} ${CYAN}$name${NC}"
            echo -e "      ${DIM}$desc${NC}"
            echo ""
            ((count++))
        fi
    done < <(get_all_pattern_ids)
    
    if [ ${#pattern_ids[@]} -eq 0 ]; then
        die "No deployment patterns available for use case '$USE_CASE_ID'"
    fi
    
    local selection
    selection=$(read_selection "Select deployment pattern [1-$((count-1))]:" "$((count-1))")
    
    # Set canonical variable name (Requirement 1.3)
    DEPLOYMENT_PATTERN="${pattern_ids[$((selection-1))]}"
    export DEPLOYMENT_PATTERN
    
    echo ""
    success "Selected: ${patterns[$((selection-1))]}"
    echo ""
}

# ============================================================================
# Step 4: Select Region
# ============================================================================

select_region() {
    section "STEP 4: Select AWS Region"
    echo ""
    
    local regions=("us-west-2" "us-east-1" "eu-west-1" "ap-southeast-1")
    local count=1
    
    for region in "${regions[@]}"; do
        if [ "$region" = "$AWS_REGION" ]; then
            echo -e "  ${BOLD}[$count]${NC} ${CYAN}$region${NC} (current)"
        else
            echo -e "  ${BOLD}[$count]${NC} $region"
        fi
        ((count++))
    done
    echo ""
    
    local selection
    selection=$(read_selection "Select region [1-$((count-1))]:" "$((count-1))")
    
    # Set canonical variable name (Requirement 1.4)
    AWS_REGION="${regions[$((selection-1))]}"
    export AWS_REGION
    
    echo ""
    success "Selected: $AWS_REGION"
    echo ""
}

# ============================================================================
# Confirm and Deploy
# ============================================================================

confirm_and_deploy() {
    section "Deployment Summary"
    echo ""
    
    # Get display names for summary
    local use_case_name
    local framework_name
    local pattern_name
    use_case_name=$(get_use_case_name "$USE_CASE_ID")
    framework_name=$(jq -r ".frameworks[] | select(.id==\"$FRAMEWORK\") | .name" "$REGISTRY_FILE")
    pattern_name=$(get_pattern_name "$DEPLOYMENT_PATTERN")
    
    echo -e "  ${BLUE}Use Case:${NC}     $use_case_name ($USE_CASE_ID)"
    echo -e "  ${BLUE}Framework:${NC}    $framework_name"
    echo -e "  ${BLUE}Pattern:${NC}      $pattern_name ($DEPLOYMENT_PATTERN)"
    echo -e "  ${BLUE}Region:${NC}       $AWS_REGION"
    echo -e "  ${BLUE}Profile:${NC}      ${AWS_PROFILE:-default}"
    echo -e "  ${BLUE}Deploy Type:${NC}  $([ "$APP_ONLY" = true ] && echo "App Only" || echo "Full (Infra + App)")"
    if [[ "$DEPLOYMENT_PATTERN" == "ec2" ]]; then
        echo -e "  ${BLUE}VPC Mode:${NC}     $([ "${USE_SHARED_VPC:-false}" = true ] && echo "Shared VPC" || echo "Use-Case VPC")"
    fi
    echo ""
    
    if ! confirm "Proceed with deployment?"; then
        echo ""
        info "Deployment cancelled"
        exit 0
    fi
    
    echo ""
    
    # ========================================================================
    # Export Canonical Variable Names
    # ========================================================================
    # Requirement 1.5: Export all Global_Variables to child processes
    
    export_global_vars
    
    # ========================================================================
    # Determine Generic Deployment Script Path
    # ========================================================================
    # Call generic deployment scripts instead of use-case-specific scripts
    
    # Map deployment pattern to script name
    local pattern_script="$DEPLOYMENT_PATTERN"
    if [ "$DEPLOYMENT_PATTERN" = "step_functions" ]; then
        pattern_script="sf"
    fi
    
    # Determine script path based on deployment mode
    local deploy_script
    if [ "$APP_ONLY" = true ]; then
        deploy_script="$PROJECT_ROOT/applications/fsi_foundry/scripts/deploy/app/deploy_${pattern_script}.sh"
    else
        deploy_script="$PROJECT_ROOT/applications/fsi_foundry/scripts/deploy/full/deploy_${pattern_script}.sh"
    fi
    
    # ========================================================================
    # Validate Deployment Script Exists
    # ========================================================================
    
    if [ ! -f "$deploy_script" ]; then
        die "Deployment script not found: $deploy_script"
    fi
    
    # ========================================================================
    # Execute Generic Deployment Script
    # ========================================================================
    # The generic deployment script will:
    # - Check for use-case-specific override scripts
    # - Handle Terraform workspace management
    # - Build Docker images with correct naming
    # - Deploy to the target infrastructure
    
    info "Executing deployment script: $deploy_script"
    echo ""
    
    # Execute the generic deployment script
    # All canonical variables are already exported
    exec "$deploy_script"
}

# ============================================================================
# Parse Command Line Arguments
# ============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --region)
            AWS_REGION="$2"
            export AWS_REGION
            shift 2
            ;;
        --app-only)
            APP_ONLY=true
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# ============================================================================
# Main Flow
# ============================================================================

# Check for jq (required for registry parsing)
if ! check_command "jq" "jq"; then
    die "jq is required but not installed. Install with: brew install jq"
fi

# Validate registry exists and is valid
if ! validate_registry; then
    die "Registry validation failed. Please check $REGISTRY_FILE"
fi

# Early AWS credentials check (fail fast before interactive menus)
info "Verifying AWS credentials..."
if ! check_aws_credentials; then
    die "AWS credentials not configured or expired. Please run: aws configure"
fi
success "AWS credentials verified"
echo ""

# Show banner
show_banner

# Interactive selection flow
# Skip steps if variables are already set via environment
if [[ -z "$USE_CASE_ID" ]]; then
    select_use_case
else
    info "Using pre-set USE_CASE_ID: $USE_CASE_ID"
    if ! validate_use_case_exists "$USE_CASE_ID"; then
        die "Use case '$USE_CASE_ID' not found in registry"
    fi
    echo ""
fi

if [[ -z "$FRAMEWORK" ]]; then
    select_framework
else
    info "Using pre-set FRAMEWORK: $FRAMEWORK"
    if ! validate_framework_supported "$USE_CASE_ID" "$FRAMEWORK"; then
        die "Framework '$FRAMEWORK' is not supported for use case '$USE_CASE_ID'"
    fi
    echo ""
fi

if [[ -z "$DEPLOYMENT_PATTERN" ]]; then
    select_pattern
else
    info "Using pre-set DEPLOYMENT_PATTERN: $DEPLOYMENT_PATTERN"
    if ! validate_pattern_supported "$USE_CASE_ID" "$DEPLOYMENT_PATTERN"; then
        die "Deployment pattern '$DEPLOYMENT_PATTERN' is not supported for use case '$USE_CASE_ID'"
    fi
    echo ""
fi

# Region selection (always show unless all variables are pre-set)
if [[ -z "${SKIP_REGION_SELECTION:-}" ]]; then
    select_region
fi

# VPC selection (only for EC2 pattern)
if [[ "$DEPLOYMENT_PATTERN" == "ec2" && -z "${USE_SHARED_VPC:-}" ]]; then
    section "STEP 5: Select VPC Mode"
    echo ""
    echo -e "  ${BOLD}[1]${NC} ${CYAN}Shared VPC${NC}"
    echo -e "      ${DIM}Use the pre-deployed shared VPC (must be deployed first via deploy_vpc.sh)${NC}"
    echo ""
    echo -e "  ${BOLD}[2]${NC} ${CYAN}Use-Case VPC${NC}"
    echo -e "      ${DIM}Create a dedicated VPC for this use case${NC}"
    echo ""
    local vpc_selection
    vpc_selection=$(read_selection "Select VPC mode [1-2]:" 2)
    if [[ "$vpc_selection" == "1" ]]; then
        USE_SHARED_VPC=true
    else
        USE_SHARED_VPC=false
    fi
    export USE_SHARED_VPC
    echo ""
    success "Selected: $([ "$USE_SHARED_VPC" = true ] && echo "Shared VPC" || echo "Use-Case VPC")"
    echo ""
elif [[ "$DEPLOYMENT_PATTERN" != "ec2" ]]; then
    USE_SHARED_VPC=false
    export USE_SHARED_VPC
fi

# Confirm and execute deployment
confirm_and_deploy
