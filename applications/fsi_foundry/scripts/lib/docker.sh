#!/bin/bash

# ============================================================================
# AVA - Docker Module
# ============================================================================
# Functions for Docker image building and management including:
# - Image name generation following naming convention
# - Dockerfile path resolution
# - Architecture lookup from registry
# - Docker image building with proper build args
# - Application code validation
#
# Usage: source "$PROJECT_ROOT/applications/scripts/lib/docker.sh"
#
# Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8
# ============================================================================

# Prevent multiple sourcing
if [[ -n "${_DOCKER_SH_LOADED:-}" ]]; then
    return 0
fi
_DOCKER_SH_LOADED=1

# Source dependencies if not already loaded
_DOCKER_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${_COMMON_SH_LOADED:-}" ]]; then
    source "$_DOCKER_SCRIPT_DIR/common.sh"
fi
if [[ -z "${_REGISTRY_SH_LOADED:-}" ]]; then
    source "$_DOCKER_SCRIPT_DIR/registry.sh"
fi

# ============================================================================
# Image Naming
# ============================================================================
# Requirement 2.2: Use naming convention ava-{USE_CASE_ID}-{FRAMEWORK_SHORT}-{DEPLOYMENT_PATTERN}:{TAG}

# Get the Docker image name following the naming convention
# Usage: IMAGE_NAME=$(get_image_name "kyc_banking" "langchain_langgraph" "ec2")
#        IMAGE_NAME=$(get_image_name "B01" "langchain_langgraph" "ec2")
#
# Arguments:
#   $1 - Use case ID or use_case_name (e.g., "B01" or "kyc_banking")
#   $2 - Framework ID (e.g., "langchain_langgraph")
#   $3 - Deployment pattern (e.g., "ec2")
#
# Returns:
#   Image name without tag using canonical ID (e.g., "ava-b01-langgraph-ec2")
get_image_name() {
    local identifier="$1"
    local framework="$2"
    local pattern="$3"

    if [[ -z "$identifier" ]]; then
        error "Use case identifier is required for image name generation"
        return 1
    fi

    if [[ -z "$framework" ]]; then
        error "FRAMEWORK is required for image name generation"
        return 1
    fi

    if [[ -z "$pattern" ]]; then
        error "DEPLOYMENT_PATTERN is required for image name generation"
        return 1
    fi

    # Normalize to canonical ID for resource naming
    local resource_id
    resource_id=$(normalize_use_case_to_id "$identifier")

    # Convert ID to lowercase for Docker naming convention
    resource_id=$(echo "$resource_id" | tr '[:upper:]' '[:lower:]')

    # Get framework short name from registry
    local framework_short
    framework_short=$(get_framework_short_name "$framework")

    # Build image name following convention
    echo "ava-${resource_id}-${framework_short}-${pattern}"
}

# Get the full Docker image name with tag
# Usage: FULL_IMAGE_NAME=$(get_image_name_with_tag "kyc" "langchain_langgraph" "ec2" "latest")
#
# Arguments:
#   $1 - Use case ID
#   $2 - Framework ID
#   $3 - Deployment pattern
#   $4 - Tag (optional, defaults to "latest")
#
# Returns:
#   Full image name with tag (e.g., "ava-kyc-langgraph-ec2:latest")
get_image_name_with_tag() {
    local use_case_id="$1"
    local framework="$2"
    local pattern="$3"
    local tag="${4:-latest}"
    
    local image_name
    image_name=$(get_image_name "$use_case_id" "$framework" "$pattern") || return 1
    
    echo "${image_name}:${tag}"
}

# ============================================================================
# Dockerfile Path Resolution
# ============================================================================
# Requirement 2.1: Maintain parameterized Dockerfiles in applications/fsi_foundry/foundations/docker/patterns/

# Get the Dockerfile path for a deployment pattern
# Usage: DOCKERFILE=$(get_dockerfile_path "ec2")
#
# Arguments:
#   $1 - Deployment pattern (e.g., "ec2", "agentcore")
#
# Returns:
#   Path to the Dockerfile relative to PROJECT_ROOT
get_dockerfile_path() {
    local pattern="$1"
    
    if [[ -z "$pattern" ]]; then
        error "DEPLOYMENT_PATTERN is required for Dockerfile path resolution"
        return 1
    fi
    
    # Standard path for pattern Dockerfiles
    echo "applications/fsi_foundry/foundations/docker/patterns/${pattern}.Dockerfile"
}

# Validate that the Dockerfile exists
# Usage: validate_dockerfile_exists "ec2" || exit 1
#
# Arguments:
#   $1 - Deployment pattern
#
# Returns:
#   0 if Dockerfile exists
#   1 if Dockerfile not found (prints error message)
validate_dockerfile_exists() {
    local pattern="$1"
    
    local dockerfile_path
    dockerfile_path=$(get_dockerfile_path "$pattern") || return 1
    
    local full_path="$PROJECT_ROOT/$dockerfile_path"
    
    if [[ ! -f "$full_path" ]]; then
        error "Dockerfile not found at $dockerfile_path"
        return 1
    fi
    
    return 0
}

# ============================================================================
# Architecture Resolution
# ============================================================================
# Requirement 5.2: Registry specifies Docker architecture for each pattern

# Get the Docker architecture for a deployment pattern
# Usage: ARCH=$(get_docker_architecture "ec2")
#
# Arguments:
#   $1 - Deployment pattern (e.g., "ec2", "agentcore")
#
# Returns:
#   Architecture string (e.g., "amd64", "arm64")
#   Empty string if pattern doesn't use Docker
get_docker_architecture() {
    local pattern="$1"
    
    if [[ -z "$pattern" ]]; then
        error "DEPLOYMENT_PATTERN is required for architecture lookup"
        return 1
    fi
    
    # Get architecture from registry
    get_pattern_architecture "$pattern"
}

# ============================================================================
# Application Code Validation
# ============================================================================
# Requirement 2.4: Copy application code from applications/fsi_foundry/use_cases/{USE_CASE_ID}/src/{FRAMEWORK}/
# Requirement 2.8: Fail with descriptive error if application code path does not exist

# Get the application code path for a use case and framework
# Usage: APP_PATH=$(get_application_code_path "kyc" "langchain_langgraph")
#
# Arguments:
#   $1 - Use case ID
#   $2 - Framework ID
#
# Returns:
#   Path to application code relative to PROJECT_ROOT
get_application_code_path() {
    local use_case_id="$1"
    local framework="$2"
    
    if [[ -z "$use_case_id" ]]; then
        error "USE_CASE_ID is required for application code path"
        return 1
    fi
    
    if [[ -z "$framework" ]]; then
        error "FRAMEWORK is required for application code path"
        return 1
    fi
    
    echo "applications/fsi_foundry/use_cases/${use_case_id}/src/${framework}"
}

# Validate that application code exists for a use case and framework
# Usage: validate_application_code_exists "kyc" "langchain_langgraph" || exit 1
#
# Arguments:
#   $1 - Use case ID
#   $2 - Framework ID
#
# Returns:
#   0 if application code exists
#   1 if application code not found (prints error message)
validate_application_code_exists() {
    local use_case_id="$1"
    local framework="$2"
    
    local app_path
    app_path=$(get_application_code_path "$use_case_id" "$framework") || return 1
    
    local full_path="$PROJECT_ROOT/$app_path"
    
    if [[ ! -d "$full_path" ]]; then
        error "Application code not found at $app_path"
        return 1
    fi
    
    return 0
}

# ============================================================================
# Docker Build
# ============================================================================
# Requirement 2.3: Accept USE_CASE_ID and FRAMEWORK as build arguments
# Requirement 2.7: Set DEPLOYMENT_MODE, USE_CASE_ID, and FRAMEWORK as environment variables

# Build a Docker image for a use case, framework, and deployment pattern
# Usage: IMAGE_NAME=$(build_docker_image "kyc" "langchain_langgraph" "ec2" "latest")
#
# Arguments:
#   $1 - Use case ID
#   $2 - Framework ID
#   $3 - Deployment pattern
#   $4 - Tag (optional, defaults to "latest")
#
# Returns:
#   Full image name with tag on success (to stdout)
#   Returns 1 on failure
#
# Note: All info/success messages go to stderr so only the image name goes to stdout
build_docker_image() {
    local use_case_id="$1"
    local framework="$2"
    local pattern="$3"
    local tag="${4:-latest}"
    
    # Validate required parameters
    if [[ -z "$use_case_id" ]]; then
        error "USE_CASE_ID is required for Docker build"
        return 1
    fi
    
    if [[ -z "$framework" ]]; then
        error "FRAMEWORK is required for Docker build"
        return 1
    fi
    
    if [[ -z "$pattern" ]]; then
        error "DEPLOYMENT_PATTERN is required for Docker build"
        return 1
    fi
    
    # Validate application code exists (Requirement 2.8)
    validate_application_code_exists "$use_case_id" "$framework" || return 1
    
    # Validate Dockerfile exists (Requirement 2.1)
    validate_dockerfile_exists "$pattern" || return 1
    
    # Get image name (Requirement 2.2)
    local image_name
    image_name=$(get_image_name "$use_case_id" "$framework" "$pattern") || return 1
    local full_image_name="${image_name}:${tag}"
    
    # Get Dockerfile path
    local dockerfile
    dockerfile=$(get_dockerfile_path "$pattern")
    
    # Get architecture from registry (Requirement 5.2)
    local arch
    arch=$(get_docker_architecture "$pattern")
    
    # Build platform argument if architecture is specified
    local platform_arg=""
    if [[ -n "$arch" ]]; then
        platform_arg="--platform linux/${arch}"
    fi
    
    # Output info messages to stderr so they don't pollute the return value
    echo -e "${BLUE}Building Docker image: $full_image_name${NC}" >&2
    echo -e "${BLUE}  Dockerfile: $dockerfile${NC}" >&2
    echo -e "${BLUE}  Architecture: ${arch:-default}${NC}" >&2
    echo -e "${BLUE}  Use Case: $use_case_id${NC}" >&2
    echo -e "${BLUE}  Framework: $framework${NC}" >&2
    
    # Build the Docker image (Requirements 2.3, 2.7)
    # shellcheck disable=SC2086
    if docker build \
        $platform_arg \
        --build-arg USE_CASE_ID="$use_case_id" \
        --build-arg FRAMEWORK="$framework" \
        --build-arg DEPLOYMENT_PATTERN="$pattern" \
        -t "$full_image_name" \
        -f "$PROJECT_ROOT/$dockerfile" \
        "$PROJECT_ROOT"; then
        echo -e "${GREEN}✓ Docker image built successfully: $full_image_name${NC}" >&2
        # Only the image name goes to stdout for capture
        echo "$full_image_name"
        return 0
    else
        error "Docker build failed. Check the build output above."
        return 1
    fi
}

# ============================================================================
# ECR Repository Naming
# ============================================================================
# Requirement 2.6: Use repository names that include use case identifier for isolation

# Get the ECR repository name for a use case and pattern
# Usage: REPO_NAME=$(get_ecr_repository_name "kyc" "langchain_langgraph" "ec2")
#
# Arguments:
#   $1 - Use case ID
#   $2 - Framework ID
#   $3 - Deployment pattern
#
# Returns:
#   ECR repository name (same as image name without tag)
get_ecr_repository_name() {
    local use_case_id="$1"
    local framework="$2"
    local pattern="$3"
    
    # ECR repository name follows the same convention as image name
    get_image_name "$use_case_id" "$framework" "$pattern"
}

# Get the full ECR image URI
# Usage: ECR_URI=$(get_ecr_image_uri "123456789012" "us-west-2" "kyc" "langchain_langgraph" "ec2" "latest")
#
# Arguments:
#   $1 - AWS Account ID
#   $2 - AWS Region
#   $3 - Use case ID
#   $4 - Framework ID
#   $5 - Deployment pattern
#   $6 - Tag (optional, defaults to "latest")
#
# Returns:
#   Full ECR image URI
get_ecr_image_uri() {
    local account_id="$1"
    local region="$2"
    local use_case_id="$3"
    local framework="$4"
    local pattern="$5"
    local tag="${6:-latest}"
    
    if [[ -z "$account_id" ]]; then
        error "AWS Account ID is required for ECR URI"
        return 1
    fi
    
    if [[ -z "$region" ]]; then
        error "AWS Region is required for ECR URI"
        return 1
    fi
    
    local repo_name
    repo_name=$(get_ecr_repository_name "$use_case_id" "$framework" "$pattern") || return 1
    
    echo "${account_id}.dkr.ecr.${region}.amazonaws.com/${repo_name}:${tag}"
}

# ============================================================================
# Docker Utilities
# ============================================================================

# Check if a Docker image exists locally
# Usage: if docker_image_exists "ava-kyc-langgraph-ec2:latest"; then ...
#
# Arguments:
#   $1 - Full image name with tag
#
# Returns:
#   0 if image exists
#   1 if image does not exist
docker_image_exists() {
    local image_name="$1"
    
    docker image inspect "$image_name" &>/dev/null
}

# Remove a local Docker image
# Usage: remove_docker_image "ava-kyc-langgraph-ec2:latest"
#
# Arguments:
#   $1 - Full image name with tag
#
# Returns:
#   0 on success
#   1 on failure
remove_docker_image() {
    local image_name="$1"
    
    if docker_image_exists "$image_name"; then
        info "Removing Docker image: $image_name"
        docker rmi "$image_name"
    else
        warn "Docker image not found: $image_name"
        return 0
    fi
}

# Tag a Docker image for ECR
# Usage: tag_for_ecr "ava-kyc-langgraph-ec2:latest" "123456789012" "us-west-2"
#
# Arguments:
#   $1 - Local image name with tag
#   $2 - AWS Account ID
#   $3 - AWS Region
#
# Returns:
#   ECR image URI on success
tag_for_ecr() {
    local local_image="$1"
    local account_id="$2"
    local region="$3"
    
    # Parse image name and tag
    local image_name="${local_image%:*}"
    local tag="${local_image##*:}"
    
    # Extract components from image name (ava-{use_case}-{framework_short}-{pattern})
    # This is a simplified extraction - in practice, we'd pass these as parameters
    local ecr_uri="${account_id}.dkr.ecr.${region}.amazonaws.com/${image_name}:${tag}"
    
    info "Tagging image for ECR: $ecr_uri"
    docker tag "$local_image" "$ecr_uri" || return 1
    
    echo "$ecr_uri"
}

# Push a Docker image to ECR
# Usage: push_to_ecr "123456789012.dkr.ecr.us-west-2.amazonaws.com/ava-kyc-langgraph-ec2:latest"
#
# Arguments:
#   $1 - Full ECR image URI
#
# Returns:
#   0 on success
#   1 on failure
push_to_ecr() {
    local ecr_uri="$1"
    
    info "Pushing image to ECR: $ecr_uri"
    docker push "$ecr_uri"
}

# Login to ECR
# Usage: ecr_login "us-west-2"
#
# Arguments:
#   $1 - AWS Region
#
# Returns:
#   0 on success
#   1 on failure
ecr_login() {
    local region="$1"
    
    info "Logging in to ECR in region: $region"
    aws ecr get-login-password --region "$region" | \
        docker login --username AWS --password-stdin \
        "$(get_aws_account_id).dkr.ecr.${region}.amazonaws.com"
}

