#!/bin/bash

# ============================================================================
# AVA - Interactive Test CLI
# ============================================================================
# Developer interface for testing deployed AI agent use cases.
# Supports both interactive mode and command-line mode.
#
# Interactive mode guides through:
#   (1) Use Case → (2) Framework → (3) Deployment Pattern → (4) Region
#
# Command-line mode:
#   ./test.sh <use_case> <pattern> [options]
#
# This script uses the shared library modules for consistent behavior and
# calls test scripts for the selected deployment pattern.
#
# Usage: 
#   ./test.sh                    # Interactive mode
#   ./test.sh kyc ec2            # Command-line mode
#   ./test.sh --help             # Show help
#   ./test.sh --region us-east-1 # Options
#
# Requirements: 4.2
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
INTERACTIVE_MODE=true

# ============================================================================
# Help and Banner Functions
# ============================================================================

# Show help
show_help() {
    show_banner
    echo "Usage: ./test.sh [options]"
    echo "       ./test.sh <use_case> <pattern> [options]"
    echo ""
    echo "Arguments (command-line mode):"
    echo "  use_case    Use case to test (e.g., kyc)"
    echo "  pattern     Deployment pattern: ec2, sf, agentcore"
    echo ""
    echo "Options:"
    echo "  --region <region>   AWS region (default: us-west-2)"
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
    echo "Examples:"
    echo "  ./test.sh                          # Interactive mode"
    echo "  ./test.sh kyc ec2                  # Test KYC on EC2"
    echo "  ./test.sh kyc sf --region us-east-1  # Test KYC Step Functions in us-east-1"
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
    section "STEP 1: Select Use Case to Test"
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
    USE_CASE_ID="${use_cases[$((selection-1))]}"
    export USE_CASE_ID
    
    local selected_name
    selected_name=$(get_use_case_name "$USE_CASE_ID")
    
    echo ""
    success "Selected: $selected_name ($USE_CASE_ID)"
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
# Normalize Pattern Name
# ============================================================================
# Convert various pattern aliases to canonical pattern IDs

normalize_pattern() {
    local pattern="$1"
    
    case "$pattern" in
        sf|step_functions|stepfunctions|lambda)
            echo "step_functions"
            ;;
        ec2|docker)
            echo "ec2"
            ;;
        agentcore|bedrock)
            echo "agentcore"
            ;;
        *)
            echo "$pattern"
            ;;
    esac
}

# ============================================================================
# Confirm and Run Tests
# ============================================================================

confirm_and_test() {
    section "Test Summary"
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
    echo ""
    
    if ! confirm "Proceed with testing?"; then
        echo ""
        info "Testing cancelled"
        exit 0
    fi
    
    echo ""
    
    # ========================================================================
    # Export Canonical Variable Names
    # ========================================================================
    # Requirement 1.5: Export all Global_Variables to child processes
    
    export_global_vars
    
    # ========================================================================
    # Determine Test Script Path
    # ========================================================================
    # First check for generic test scripts, then fall back to use-case-specific
    
    # Map deployment pattern to script name
    local pattern_script="$DEPLOYMENT_PATTERN"
    if [ "$DEPLOYMENT_PATTERN" = "step_functions" ]; then
        pattern_script="sf"
    fi
    
    # Check for generic test script first
    local generic_test_script="$PROJECT_ROOT/applications/fsi_foundry/scripts/test/test_${pattern_script}.sh"
    
    # Check for use-case-specific test script
    local use_case_test_script="$PROJECT_ROOT/applications/fsi_foundry/scripts/use_cases/$USE_CASE_ID/test/test_${pattern_script}.sh"
    
    local test_script=""
    
    if [ -f "$generic_test_script" ]; then
        test_script="$generic_test_script"
        info "Using generic test script: $test_script"
    elif [ -f "$use_case_test_script" ]; then
        test_script="$use_case_test_script"
        info "Using use-case-specific test script: $test_script"
    else
        die "Test script not found. Checked:\n  - $generic_test_script\n  - $use_case_test_script"
    fi
    
    echo ""
    
    # ========================================================================
    # Execute Test Script
    # ========================================================================
    # The test script will:
    # - Run tests against the deployed infrastructure
    # - Report test results
    
    info "Starting tests..."
    echo ""
    
    # Execute the test script with USE_CASE_ID as argument (for backward compatibility)
    # All canonical variables are already exported
    exec "$test_script" "$USE_CASE_ID"
}

# ============================================================================
# Parse Command Line Arguments
# ============================================================================

# Positional arguments for command-line mode
POSITIONAL_ARGS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --region)
            AWS_REGION="$2"
            export AWS_REGION
            shift 2
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        -*)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
        *)
            POSITIONAL_ARGS+=("$1")
            shift
            ;;
    esac
done

# ============================================================================
# Determine Mode (Interactive vs Command-Line)
# ============================================================================

# If positional arguments provided, use command-line mode
if [ ${#POSITIONAL_ARGS[@]} -ge 2 ]; then
    INTERACTIVE_MODE=false
    
    # Set USE_CASE_ID from first positional argument
    USE_CASE_ID="${POSITIONAL_ARGS[0]}"
    export USE_CASE_ID
    
    # Set DEPLOYMENT_PATTERN from second positional argument (normalize it)
    DEPLOYMENT_PATTERN=$(normalize_pattern "${POSITIONAL_ARGS[1]}")
    export DEPLOYMENT_PATTERN
    
    # Default FRAMEWORK if not set
    if [[ -z "$FRAMEWORK" ]]; then
        # Get the first supported framework for this use case
        FRAMEWORK=$(get_supported_frameworks "$USE_CASE_ID" | head -n 1)
        export FRAMEWORK
    fi
elif [ ${#POSITIONAL_ARGS[@]} -eq 1 ]; then
    error "Missing required argument: pattern"
    echo ""
    show_help
    exit 1
fi

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

# Show banner
show_banner

echo -e "${YELLOW}This tool will help you test deployed AVA resources.${NC}"
echo ""

if [ "$INTERACTIVE_MODE" = true ]; then
    # ========================================================================
    # Interactive Mode
    # ========================================================================
    
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
else
    # ========================================================================
    # Command-Line Mode
    # ========================================================================
    
    # Validate use case exists
    if ! validate_use_case_exists "$USE_CASE_ID"; then
        die "Use case '$USE_CASE_ID' not found in registry"
    fi
    
    # Validate pattern is supported
    if ! validate_pattern_supported "$USE_CASE_ID" "$DEPLOYMENT_PATTERN"; then
        die "Deployment pattern '$DEPLOYMENT_PATTERN' is not supported for use case '$USE_CASE_ID'"
    fi
    
    # Validate framework is supported (if set)
    if [[ -n "$FRAMEWORK" ]]; then
        if ! validate_framework_supported "$USE_CASE_ID" "$FRAMEWORK"; then
            die "Framework '$FRAMEWORK' is not supported for use case '$USE_CASE_ID'"
        fi
    fi
    
    # Display test info
    info "Use Case:    $USE_CASE_ID"
    info "Pattern:     $(get_pattern_name "$DEPLOYMENT_PATTERN") ($DEPLOYMENT_PATTERN)"
    info "Region:      $AWS_REGION"
    echo ""
fi

# Confirm and execute tests
confirm_and_test
