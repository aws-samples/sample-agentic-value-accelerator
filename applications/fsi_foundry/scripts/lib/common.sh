#!/bin/bash

# ============================================================================
# AVA - Common Shell Library
# ============================================================================
# Shared utilities for all deployment scripts including:
# - Color definitions for consistent output formatting
# - Error handling functions
# - Path resolution for project directories
# - Common utility functions
#
# Usage: source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/common.sh"
#
# Requirements: 1.5, 6.1
# ============================================================================

# Prevent multiple sourcing
if [[ -n "${_COMMON_SH_LOADED:-}" ]]; then
    return 0
fi
_COMMON_SH_LOADED=1

# ============================================================================
# Color Definitions
# ============================================================================
# Standard color codes for consistent output formatting across all scripts

export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export CYAN='\033[0;36m'
export MAGENTA='\033[0;35m'
export BOLD='\033[1m'
export DIM='\033[2m'
export NC='\033[0m'  # No Color / Reset

# ============================================================================
# Path Resolution
# ============================================================================
# Resolve PROJECT_ROOT from this script's location
# This works regardless of where the script is called from

# Get the directory where this script is located
_COMMON_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# PROJECT_ROOT is four levels up from applications/fsi_foundry/scripts/lib/
export PROJECT_ROOT="$(cd "$_COMMON_SCRIPT_DIR/../../../.." && pwd)"

# Common paths used throughout the project
export REGISTRY_FILE="$PROJECT_ROOT/applications/fsi_foundry/data/registry/offerings.json"
export SCRIPTS_DIR="$PROJECT_ROOT/applications/fsi_foundry/scripts"
export SCRIPTS_LIB_DIR="$PROJECT_ROOT/applications/fsi_foundry/scripts/lib"
export SCRIPTS_DEPLOY_DIR="$PROJECT_ROOT/applications/fsi_foundry/scripts/deploy"
export SCRIPTS_CLEANUP_DIR="$PROJECT_ROOT/applications/fsi_foundry/scripts/cleanup"
export SCRIPTS_TEST_DIR="$PROJECT_ROOT/applications/fsi_foundry/scripts/test"
export APPLICATIONS_DIR="$PROJECT_ROOT/applications/fsi_foundry"
export FOUNDATIONS_DIR="$PROJECT_ROOT/applications/fsi_foundry/foundations"
export FOUNDATIONS_IAC_DIR="$PROJECT_ROOT/applications/fsi_foundry/foundations/iac"
export FOUNDATIONS_DOCKER_DIR="$PROJECT_ROOT/applications/fsi_foundry/foundations/docker"
export DATA_DIR="$PROJECT_ROOT/applications/fsi_foundry/data"
export DOCS_DIR="$PROJECT_ROOT/applications/fsi_foundry/docs"

# Guard: fail if foundations directory doesn't exist
if [[ ! -d "$FOUNDATIONS_DIR" ]]; then
    echo -e "\033[0;31mError: Foundations directory not found: $FOUNDATIONS_DIR\033[0m" >&2
    echo "The repository structure may not be set up correctly." >&2
    exit 1
fi

# ============================================================================
# Error Handling
# ============================================================================

# Print an error message to stderr
# Usage: error "Something went wrong"
error() {
    echo -e "${RED}Error: $*${NC}" >&2
}

# Print a warning message to stderr
# Usage: warn "This might be a problem"
warn() {
    echo -e "${YELLOW}Warning: $*${NC}" >&2
}

# Print an info message
# Usage: info "Processing..."
info() {
    echo -e "${BLUE}$*${NC}"
}

# Print a success message
# Usage: success "Operation completed"
success() {
    echo -e "${GREEN}✓ $*${NC}"
}

# Print a step header
# Usage: step "Step 1/4: Building Docker image"
step() {
    echo -e "${YELLOW}$*${NC}"
}

# Print a section header
# Usage: section "Deployment Summary"
section() {
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  $*${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Exit with an error message
# Usage: die "Fatal error occurred"
die() {
    error "$*"
    exit 1
}

# ============================================================================
# Prerequisite Checks
# ============================================================================

# Check if a command exists
# Usage: check_command "aws" "AWS CLI"
check_command() {
    local cmd="$1"
    local name="${2:-$cmd}"
    
    if ! command -v "$cmd" &> /dev/null; then
        error "$name is not installed"
        return 1
    fi
    return 0
}

# Check all common prerequisites
# Usage: check_prerequisites
check_prerequisites() {
    local missing=()
    
    check_command "aws" "AWS CLI" || missing+=("aws")
    check_command "jq" "jq" || missing+=("jq")
    check_command "terraform" "Terraform" || missing+=("terraform")
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        error "Missing required tools: ${missing[*]}"
        echo "Please install the missing tools and try again."
        return 1
    fi
    
    return 0
}

# Check if Docker is available (optional for some patterns)
# Usage: check_docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
        return 1
    fi
    
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
        return 1
    fi
    
    return 0
}

# Verify AWS credentials are configured
# Usage: check_aws_credentials
check_aws_credentials() {
    if ! aws sts get-caller-identity &> /dev/null; then
        error "AWS credentials not configured or expired"
        echo "Please run: aws configure"
        return 1
    fi
    return 0
}

# ============================================================================
# Fresh Account Pre-Flight Checks
# ============================================================================

# Check Bedrock model access in the target region
# Usage: check_bedrock_model_access "us-west-2" "anthropic.claude-3-sonnet-20240229-v1:0"
check_bedrock_model_access() {
    local region="${1:-$AWS_REGION}"
    local model_id="${2:-anthropic.claude-3-sonnet-20240229-v1:0}"
    
    if [[ -z "$region" ]]; then
        region="us-west-2"
    fi
    
    # Check if model is accessible
    if ! aws bedrock get-foundation-model \
        --model-identifier "$model_id" \
        --region "$region" &>/dev/null; then
        error "Bedrock model '$model_id' not accessible in region '$region'"
        echo ""
        echo "To enable model access:"
        echo "  1. Go to AWS Console > Amazon Bedrock > Model access"
        echo "  2. Click 'Manage model access'"
        echo "  3. Enable access for Claude models (Anthropic)"
        echo "  4. Wait for access to be granted (usually immediate)"
        echo ""
        return 1
    fi
    return 0
}

# Check if AgentCore is available in the target region
# Usage: check_agentcore_region "us-west-2"
check_agentcore_region() {
    local region="${1:-$AWS_REGION}"
    
    # AgentCore supported regions (as of 2026)
    local supported_regions="us-east-1 us-west-2 eu-west-1 ap-northeast-1 ap-southeast-1 ap-southeast-2"
    
    if ! echo "$supported_regions" | grep -qw "$region"; then
        warn "AgentCore may not be available in region '$region'"
        echo "Supported regions: $supported_regions"
        echo "Check latest availability: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-regions.html"
        return 1
    fi
    return 0
}

# Run all fresh account pre-flight checks
# Usage: run_preflight_checks "agentcore" "us-west-2"
run_preflight_checks() {
    local pattern="${1:-$DEPLOYMENT_PATTERN}"
    local region="${2:-$AWS_REGION}"
    
    info "Running pre-flight checks for fresh account deployment..."
    
    local checks_passed=true
    
    # Check AWS credentials
    if ! check_aws_credentials; then
        checks_passed=false
    fi
    
    # Check Bedrock model access (required for all patterns)
    if ! check_bedrock_model_access "$region"; then
        checks_passed=false
    fi
    
    # Check AgentCore region availability (only for agentcore pattern)
    if [[ "$pattern" == "agentcore" ]]; then
        if ! check_agentcore_region "$region"; then
            # This is a warning, not a failure
            warn "Proceeding despite AgentCore region warning..."
        fi
    fi
    
    if [[ "$checks_passed" == "false" ]]; then
        error "Pre-flight checks failed. Please resolve the issues above."
        return 1
    fi
    
    success "Pre-flight checks passed"
    return 0
}

# ============================================================================
# File and Path Utilities
# ============================================================================

# Check if a file exists
# Usage: file_exists "$REGISTRY_FILE" "Registry file"
file_exists() {
    local file="$1"
    local name="${2:-$file}"
    
    if [[ ! -f "$file" ]]; then
        error "$name not found: $file"
        return 1
    fi
    return 0
}

# Check if a directory exists
# Usage: dir_exists "$PROJECT_ROOT/applications/kyc" "KYC application"
dir_exists() {
    local dir="$1"
    local name="${2:-$dir}"
    
    if [[ ! -d "$dir" ]]; then
        error "$name not found: $dir"
        return 1
    fi
    return 0
}

# Get the absolute path of a file or directory
# Usage: abs_path "relative/path"
abs_path() {
    local path="$1"
    
    if [[ -d "$path" ]]; then
        (cd "$path" && pwd)
    elif [[ -f "$path" ]]; then
        local dir=$(dirname "$path")
        local file=$(basename "$path")
        echo "$(cd "$dir" && pwd)/$file"
    else
        # Path doesn't exist, just normalize it
        echo "$(cd "$(dirname "$path")" 2>/dev/null && pwd)/$(basename "$path")" 2>/dev/null || echo "$path"
    fi
}

# ============================================================================
# AWS Utilities
# ============================================================================

# Get the current AWS account ID
# Usage: AWS_ACCOUNT=$(get_aws_account_id)
get_aws_account_id() {
    aws sts get-caller-identity --query Account --output text
}

# Get the current AWS region (from env var or AWS config)
# Usage: REGION=$(get_aws_region)
get_aws_region() {
    echo "${AWS_REGION:-$(aws configure get region 2>/dev/null || echo "us-west-2")}"
}

# ============================================================================
# Banner and Display Utilities
# ============================================================================

# Show the AVA banner
# Usage: show_banner
show_banner() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}AVA${NC} - AI Agent Deployment Platform  ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${DIM}Financial Services Industry Use Cases${NC}          ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Show a deployment summary
# Usage: show_deployment_summary
show_deployment_summary() {
    section "Deployment Summary"
    echo ""
    echo -e "  ${BLUE}Use Case:${NC}     ${USE_CASE_ID:-not set}"
    echo -e "  ${BLUE}Framework:${NC}    ${FRAMEWORK:-not set}"
    echo -e "  ${BLUE}Pattern:${NC}      ${DEPLOYMENT_PATTERN:-not set}"
    echo -e "  ${BLUE}Region:${NC}       ${AWS_REGION:-not set}"
    echo -e "  ${BLUE}Profile:${NC}      ${AWS_PROFILE:-default}"
    echo ""
}

# ============================================================================
# Confirmation Utilities
# ============================================================================

# Ask for user confirmation
# Usage: confirm "Proceed with deployment?" || exit 0
confirm() {
    local prompt="${1:-Continue?}"
    local response
    
    echo -ne "${YELLOW}$prompt [y/N]:${NC} "
    read -r response
    
    [[ "$response" =~ ^[Yy]$ ]]
}

# ============================================================================
# Sample Data Utilities
# ============================================================================

# Upload sample data to S3 bucket for a use case
# Usage: upload_sample_data "kyc_banking" "s3-bucket-name" ["us-west-2"]
#
# This function uploads sample data files from data/samples/{use_case_id}/
# to the S3 bucket at s3://{bucket}/samples/{use_case_id}/
#
# Parameters:
#   use_case_id - The use case identifier (e.g., "kyc_banking")
#   s3_bucket   - The S3 bucket name to upload to
#   region      - Optional AWS region (defaults to AWS_REGION)
#
# Returns:
#   0 on success or if no sample data exists
#   1 on failure
upload_sample_data() {
    local use_case_id="$1"
    local s3_bucket="$2"
    local region="${3:-$AWS_REGION}"
    
    if [[ -z "$use_case_id" || -z "$s3_bucket" ]]; then
        warn "Missing parameters for sample data upload"
        return 1
    fi
    
    local sample_data_path="$PROJECT_ROOT/applications/fsi_foundry/data/samples/$use_case_id"
    
    if [[ ! -d "$sample_data_path" ]]; then
        info "No sample data found at $sample_data_path (skipping)"
        return 0
    fi
    
    # Count files to upload
    local file_count
    file_count=$(find "$sample_data_path" -type f | wc -l | tr -d ' ')
    
    if [[ "$file_count" -eq 0 ]]; then
        info "No sample data files found (skipping)"
        return 0
    fi
    
    info "Uploading $file_count sample data files to S3..."
    
    if aws s3 sync "$sample_data_path" "s3://$s3_bucket/samples/$use_case_id/" \
        --region "$region" \
        --quiet 2>/dev/null; then
        success "Sample data uploaded to s3://$s3_bucket/samples/$use_case_id/"
        return 0
    else
        warn "Failed to upload sample data to S3"
        return 1
    fi
}

# ============================================================================
# Initialization
# ============================================================================

# Verify that PROJECT_ROOT was resolved correctly
if [[ ! -f "$REGISTRY_FILE" ]]; then
    # Try to find registry file from current directory
    if [[ -f "./applications/fsi_foundry/data/registry/offerings.json" ]]; then
        export PROJECT_ROOT="$(pwd)"
        export REGISTRY_FILE="$PROJECT_ROOT/applications/fsi_foundry/data/registry/offerings.json"
    fi
fi

# ============================================================================
# AWS Resource Naming Constraint Validation
# ============================================================================
# Requirement 2.9: Validate and truncate resource names to comply with AWS limits
# AWS service-specific naming constraints:
# - S3 buckets: 3-63 characters, lowercase alphanumeric and hyphens
# - ALB/Target Groups: 1-32 characters, alphanumeric and hyphens
# - Lambda functions: 1-64 characters, alphanumeric, hyphens, underscores
# - IAM roles: 1-64 characters, alphanumeric, plus, equals, comma, period, at, underscore, hyphen
# - ECR repositories: 2-256 characters, lowercase alphanumeric, hyphens, underscores, forward slashes
# - Step Functions: 1-80 characters, alphanumeric, hyphens, underscores
# - CloudFormation stacks: 1-128 characters, alphanumeric, hyphens

# Get AWS resource name length limit for a service type
# Compatible with bash 3.x (no associative arrays)
# Usage: LIMIT=$(get_aws_name_limit "alb")
get_aws_name_limit() {
    local service_type="$1"
    case "$service_type" in
        s3) echo 63 ;;
        alb) echo 32 ;;
        target_group) echo 32 ;;
        lambda) echo 64 ;;
        iam_role) echo 64 ;;
        iam_policy) echo 128 ;;
        ecr) echo 256 ;;
        step_functions) echo 80 ;;
        cloudformation) echo 128 ;;
        ec2_instance) echo 255 ;;
        security_group) echo 255 ;;
        *) echo 255 ;;  # Default limit
    esac
}

# Validate resource name length for a specific AWS service
# Usage: validate_aws_name_length "my-resource-name" "alb" || die "Name too long"
#
# Arguments:
#   $1 - Resource name to validate
#   $2 - AWS service type (s3, alb, target_group, lambda, iam_role, ecr, step_functions, cloudformation)
#
# Returns:
#   0 if name is within limits
#   1 if name exceeds limit (prints error message)
validate_aws_name_length() {
    local name="$1"
    local service_type="$2"
    
    if [[ -z "$name" ]]; then
        error "Resource name is required for validation"
        return 1
    fi
    
    if [[ -z "$service_type" ]]; then
        error "Service type is required for validation"
        return 1
    fi
    
    local limit
    limit=$(get_aws_name_limit "$service_type")
    
    local name_length=${#name}
    
    if [[ $name_length -gt $limit ]]; then
        error "Resource name '$name' exceeds $service_type limit of $limit characters (actual: $name_length)"
        return 1
    fi
    
    return 0
}

# Truncate resource name to fit AWS service limits
# Usage: TRUNCATED_NAME=$(truncate_aws_name "my-very-long-resource-name" "alb")
#
# Arguments:
#   $1 - Resource name to truncate
#   $2 - AWS service type (s3, alb, target_group, lambda, iam_role, ecr, step_functions, cloudformation)
#
# Returns:
#   Truncated name that fits within the service limit
truncate_aws_name() {
    local name="$1"
    local service_type="$2"
    
    if [[ -z "$name" ]]; then
        return 1
    fi
    
    local limit
    limit=$(get_aws_name_limit "$service_type")
    local name_length=${#name}
    
    if [[ $name_length -le $limit ]]; then
        echo "$name"
    else
        # Truncate to limit
        echo "${name:0:$limit}"
    fi
}

# Truncate resource name with a suffix preserved
# Usage: TRUNCATED_NAME=$(truncate_aws_name_with_suffix "my-very-long-resource-name" "alb" "-suffix")
#
# Arguments:
#   $1 - Resource name to truncate
#   $2 - AWS service type
#   $3 - Suffix to preserve (e.g., "-alb", "-tg")
#
# Returns:
#   Truncated name with suffix that fits within the service limit
truncate_aws_name_with_suffix() {
    local name="$1"
    local service_type="$2"
    local suffix="$3"
    
    if [[ -z "$name" ]]; then
        return 1
    fi
    
    local limit
    limit=$(get_aws_name_limit "$service_type")
    local suffix_length=${#suffix}
    local available_length=$((limit - suffix_length))
    local name_length=${#name}
    
    if [[ $name_length -le $available_length ]]; then
        echo "${name}${suffix}"
    else
        # Truncate name to fit suffix
        echo "${name:0:$available_length}${suffix}"
    fi
}

# Validate S3 bucket name format
# Usage: validate_s3_bucket_name "my-bucket-name" || die "Invalid bucket name"
#
# S3 bucket naming rules:
# - 3-63 characters
# - Lowercase letters, numbers, and hyphens only
# - Must start and end with a letter or number
# - Cannot contain consecutive periods
# - Cannot be formatted as an IP address
#
# Arguments:
#   $1 - Bucket name to validate
#
# Returns:
#   0 if valid
#   1 if invalid (prints error message)
validate_s3_bucket_name() {
    local name="$1"
    
    if [[ -z "$name" ]]; then
        error "S3 bucket name is required"
        return 1
    fi
    
    local name_length=${#name}
    
    # Check length
    if [[ $name_length -lt 3 || $name_length -gt 63 ]]; then
        error "S3 bucket name must be 3-63 characters (actual: $name_length)"
        return 1
    fi
    
    # Check for valid characters (lowercase alphanumeric and hyphens)
    if [[ ! "$name" =~ ^[a-z0-9][a-z0-9-]*[a-z0-9]$ && ! "$name" =~ ^[a-z0-9]$ ]]; then
        error "S3 bucket name must contain only lowercase letters, numbers, and hyphens, and must start/end with a letter or number"
        return 1
    fi
    
    # Check for consecutive hyphens
    if [[ "$name" =~ -- ]]; then
        error "S3 bucket name cannot contain consecutive hyphens"
        return 1
    fi
    
    return 0
}

# Convert a name to S3-safe format
# Usage: S3_NAME=$(to_s3_safe_name "My_Use_Case")
#
# Converts:
# - Uppercase to lowercase
# - Underscores to hyphens
# - Removes invalid characters
#
# Arguments:
#   $1 - Name to convert
#
# Returns:
#   S3-safe name
to_s3_safe_name() {
    local name="$1"
    
    # Convert to lowercase and replace underscores with hyphens
    echo "$name" | tr '[:upper:]' '[:lower:]' | tr '_' '-' | sed 's/[^a-z0-9-]//g'
}
