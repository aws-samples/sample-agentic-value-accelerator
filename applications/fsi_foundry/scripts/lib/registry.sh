#!/bin/bash

# ============================================================================
# AVA - Registry Module
# ============================================================================
# Functions for interacting with the registry (data/registry/offerings.json)
# including:
# - Registry validation
# - Use case retrieval and validation
# - Framework retrieval and validation
# - Deployment pattern retrieval and validation
#
# Usage: source "$PROJECT_ROOT/applications/scripts/lib/registry.sh"
#
# Requirements: 4.2, 4.3, 4.7, 5.5
# ============================================================================

# Prevent multiple sourcing
if [[ -n "${_REGISTRY_SH_LOADED:-}" ]]; then
    return 0
fi
_REGISTRY_SH_LOADED=1

# Source common utilities if not already loaded
_REGISTRY_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${_COMMON_SH_LOADED:-}" ]]; then
    source "$_REGISTRY_SCRIPT_DIR/common.sh"
fi

# ============================================================================
# Registry Validation
# ============================================================================
# Requirement 5.5: Validate Registry entries for required fields on startup

# Validate the registry file structure and required fields
# Usage: validate_registry || exit 1
#
# Validates:
#   - Registry file exists and is valid JSON
#   - All frameworks have required fields (id, name, short_name)
#   - All deployment patterns have required fields (id, name, iac_path)
#   - All deployment patterns with uses_docker=true have architecture field
#   - All use cases have required fields (id, name, supported_frameworks, supported_patterns)
#
# Returns:
#   0 if registry is valid
#   1 if validation fails (prints error message)
validate_registry() {
    # Check if registry file exists
    if [[ ! -f "$REGISTRY_FILE" ]]; then
        error "Registry file not found: $REGISTRY_FILE"
        return 1
    fi
    
    # Check if registry file is valid JSON
    if ! jq empty "$REGISTRY_FILE" 2>/dev/null; then
        error "Registry file is not valid JSON: $REGISTRY_FILE"
        return 1
    fi
    
    local errors=()
    
    # Validate frameworks have required fields
    local framework_count
    framework_count=$(jq '.frameworks | length' "$REGISTRY_FILE")
    
    for ((i=0; i<framework_count; i++)); do
        local fw_id fw_name fw_short_name
        fw_id=$(jq -r ".frameworks[$i].id // empty" "$REGISTRY_FILE")
        fw_name=$(jq -r ".frameworks[$i].name // empty" "$REGISTRY_FILE")
        fw_short_name=$(jq -r ".frameworks[$i].short_name // empty" "$REGISTRY_FILE")
        
        if [[ -z "$fw_id" ]]; then
            errors+=("Framework at index $i is missing 'id' field")
        fi
        if [[ -z "$fw_name" ]]; then
            errors+=("Framework '${fw_id:-at index $i}' is missing 'name' field")
        fi
        if [[ -z "$fw_short_name" ]]; then
            errors+=("Framework '${fw_id:-at index $i}' is missing 'short_name' field")
        fi
    done
    
    # Validate deployment patterns have required fields
    local pattern_count
    pattern_count=$(jq '.deployment_patterns | length' "$REGISTRY_FILE")
    
    for ((i=0; i<pattern_count; i++)); do
        local pat_id pat_name pat_iac_path pat_uses_docker pat_architecture
        pat_id=$(jq -r ".deployment_patterns[$i].id // empty" "$REGISTRY_FILE")
        pat_name=$(jq -r ".deployment_patterns[$i].name // empty" "$REGISTRY_FILE")
        pat_iac_path=$(jq -r ".deployment_patterns[$i].iac_path // empty" "$REGISTRY_FILE")
        pat_uses_docker=$(jq -r ".deployment_patterns[$i].uses_docker // empty" "$REGISTRY_FILE")
        pat_architecture=$(jq -r ".deployment_patterns[$i].architecture // empty" "$REGISTRY_FILE")
        
        if [[ -z "$pat_id" ]]; then
            errors+=("Deployment pattern at index $i is missing 'id' field")
        fi
        if [[ -z "$pat_name" ]]; then
            errors+=("Deployment pattern '${pat_id:-at index $i}' is missing 'name' field")
        fi
        if [[ -z "$pat_iac_path" ]]; then
            errors+=("Deployment pattern '${pat_id:-at index $i}' is missing 'iac_path' field")
        fi
        # If uses_docker is true, architecture must be set
        if [[ "$pat_uses_docker" == "true" && -z "$pat_architecture" ]]; then
            errors+=("Deployment pattern '${pat_id:-at index $i}' has uses_docker=true but is missing 'architecture' field")
        fi
    done
    
    # Validate use cases have required fields
    local use_case_count
    use_case_count=$(jq '.use_cases | length' "$REGISTRY_FILE")
    
    for ((i=0; i<use_case_count; i++)); do
        local uc_id uc_name uc_supported_frameworks uc_supported_patterns
        uc_id=$(jq -r ".use_cases[$i].id // empty" "$REGISTRY_FILE")
        uc_name=$(jq -r ".use_cases[$i].name // empty" "$REGISTRY_FILE")
        uc_supported_frameworks=$(jq -r ".use_cases[$i].supported_frameworks // empty" "$REGISTRY_FILE")
        uc_supported_patterns=$(jq -r ".use_cases[$i].supported_patterns // empty" "$REGISTRY_FILE")
        
        if [[ -z "$uc_id" ]]; then
            errors+=("Use case at index $i is missing 'id' field")
        fi
        if [[ -z "$uc_name" ]]; then
            errors+=("Use case '${uc_id:-at index $i}' is missing 'name' field")
        fi
        if [[ -z "$uc_supported_frameworks" || "$uc_supported_frameworks" == "null" ]]; then
            errors+=("Use case '${uc_id:-at index $i}' is missing 'supported_frameworks' field")
        fi
        if [[ -z "$uc_supported_patterns" || "$uc_supported_patterns" == "null" ]]; then
            errors+=("Use case '${uc_id:-at index $i}' is missing 'supported_patterns' field")
        fi
    done
    
    # Report errors if any
    if [[ ${#errors[@]} -gt 0 ]]; then
        error "Registry validation failed:"
        for err in "${errors[@]}"; do
            echo "  - $err" >&2
        done
        return 1
    fi
    
    return 0
}

# ============================================================================
# Use Case Functions
# ============================================================================
# Requirement 4.2: Read available use cases from the Registry
# Requirement 4.7: Fail with descriptive error if use case not found

# Get a use case by ID or use_case_name
# Usage: USE_CASE_JSON=$(get_use_case "B01")
#        USE_CASE_JSON=$(get_use_case "kyc_banking")
#
# Arguments:
#   $1 - Use case ID (e.g., "B01") or use_case_name (e.g., "kyc_banking")
#
# Returns:
#   JSON object of the use case if found
#   Empty string if not found
get_use_case() {
    local identifier="$1"

    if [[ -z "$identifier" ]]; then
        return 1
    fi

    # Try matching by ID first, then by use_case_name
    jq -r ".use_cases[] | select(.id == \"$identifier\" or .use_case_name == \"$identifier\")" "$REGISTRY_FILE"
}

# Get use case ID from either ID or use_case_name
# Usage: USE_CASE_ID=$(get_use_case_id "kyc_banking")
#        USE_CASE_ID=$(get_use_case_id "B01")
#
# Arguments:
#   $1 - Use case ID or use_case_name
#
# Returns:
#   The ID (e.g., "B01") if found, empty string otherwise
get_use_case_id() {
    local identifier="$1"

    if [[ -z "$identifier" ]]; then
        return 1
    fi

    jq -r ".use_cases[] | select(.id == \"$identifier\" or .use_case_name == \"$identifier\") | .id" "$REGISTRY_FILE"
}

# Get use case name (use_case_name field) from either ID or use_case_name
# Usage: USE_CASE_NAME=$(get_use_case_name_field "B01")
#        USE_CASE_NAME=$(get_use_case_name_field "kyc_banking")
#
# Arguments:
#   $1 - Use case ID or use_case_name
#
# Returns:
#   The use_case_name (e.g., "kyc_banking") if found, empty string otherwise
get_use_case_name_field() {
    local identifier="$1"

    if [[ -z "$identifier" ]]; then
        return 1
    fi

    jq -r ".use_cases[] | select(.id == \"$identifier\" or .use_case_name == \"$identifier\") | .use_case_name" "$REGISTRY_FILE"
}

# Validate that a use case exists in the registry
# Usage: validate_use_case_exists "B01" || exit 1
#        validate_use_case_exists "kyc_banking" || exit 1
#
# Arguments:
#   $1 - Use case ID or use_case_name to validate
#
# Returns:
#   0 if use case exists
#   1 if use case not found (prints error message)
validate_use_case_exists() {
    local identifier="$1"

    if [[ -z "$identifier" ]]; then
        error "Use case identifier is required"
        return 1
    fi

    local use_case
    use_case=$(get_use_case "$identifier")

    if [[ -z "$use_case" ]]; then
        error "Use case '$identifier' not found in registry"
        return 1
    fi

    return 0
}

# Get all use case IDs from the registry
# Usage: USE_CASE_IDS=$(get_all_use_case_ids)
#
# Returns:
#   Newline-separated list of use case IDs
get_all_use_case_ids() {
    jq -r '.use_cases[].id' "$REGISTRY_FILE"
}

# Normalize any use case identifier (ID or use_case_name) to the canonical ID
# This is used for resource naming to ensure consistent ID-based naming
# Usage: RESOURCE_ID=$(normalize_use_case_to_id "kyc_banking")
#        RESOURCE_ID=$(normalize_use_case_to_id "B01")
#
# Arguments:
#   $1 - Use case ID or use_case_name
#
# Returns:
#   The canonical ID (e.g., "B01") for resource naming
#   Returns the input unchanged if not found in registry
normalize_use_case_to_id() {
    local identifier="$1"

    if [[ -z "$identifier" ]]; then
        return 1
    fi

    local use_case_id
    use_case_id=$(get_use_case_id "$identifier")

    if [[ -n "$use_case_id" ]]; then
        echo "$use_case_id"
    else
        # If not found in registry, return the input unchanged
        # This allows for forward compatibility
        echo "$identifier"
    fi
}

# Get use case display name by ID or use_case_name
# Usage: NAME=$(get_use_case_name "B01")
#        NAME=$(get_use_case_name "kyc_banking")
#
# Returns the human-readable name (e.g., "KYC Risk Assessment - Banking")
get_use_case_name() {
    local identifier="$1"
    jq -r ".use_cases[] | select(.id == \"$identifier\" or .use_case_name == \"$identifier\") | .name" "$REGISTRY_FILE"
}

# ============================================================================
# Framework Functions
# ============================================================================
# Requirement 4.2: Read available frameworks from the Registry

# Get a framework by ID
# Usage: FRAMEWORK_JSON=$(get_framework "langchain_langgraph")
#
# Arguments:
#   $1 - Framework ID (e.g., "langchain_langgraph")
#
# Returns:
#   JSON object of the framework if found
#   Empty string if not found
get_framework() {
    local framework_id="$1"
    
    if [[ -z "$framework_id" ]]; then
        return 1
    fi
    
    jq -r ".frameworks[] | select(.id == \"$framework_id\")" "$REGISTRY_FILE"
}

# Get framework short name from registry
# Usage: SHORT_NAME=$(get_framework_short_name "langchain_langgraph")
#
# Arguments:
#   $1 - Framework ID
#
# Returns:
#   Short name for the framework, or the original ID if not found
get_framework_short_name() {
    local framework_id="$1"
    local short_name
    
    short_name=$(jq -r ".frameworks[] | select(.id == \"$framework_id\") | .short_name // empty" "$REGISTRY_FILE")
    
    if [[ -z "$short_name" ]]; then
        echo "$framework_id"
    else
        echo "$short_name"
    fi
}

# Get all framework IDs from the registry
# Usage: FRAMEWORK_IDS=$(get_all_framework_ids)
#
# Returns:
#   Newline-separated list of framework IDs
get_all_framework_ids() {
    jq -r '.frameworks[].id' "$REGISTRY_FILE"
}

# Validate that a framework is supported for a use case
# Usage: validate_framework_supported "B01" "langchain_langgraph" || exit 1
#        validate_framework_supported "kyc_banking" "langchain_langgraph" || exit 1
#
# Arguments:
#   $1 - Use case ID or use_case_name
#   $2 - Framework ID to validate
#
# Returns:
#   0 if framework is supported for the use case
#   1 if framework is not supported (prints error message)
validate_framework_supported() {
    local identifier="$1"
    local framework_id="$2"

    if [[ -z "$identifier" ]]; then
        error "Use case identifier is required"
        return 1
    fi

    if [[ -z "$framework_id" ]]; then
        error "FRAMEWORK is required"
        return 1
    fi

    # First check if use case exists
    if ! validate_use_case_exists "$identifier" 2>/dev/null; then
        error "Use case '$identifier' not found in registry"
        return 1
    fi

    # Check if framework is in the use case's supported_frameworks array
    local is_supported
    is_supported=$(jq -r ".use_cases[] | select(.id == \"$identifier\" or .use_case_name == \"$identifier\") | .supported_frameworks | index(\"$framework_id\") != null" "$REGISTRY_FILE")

    if [[ "$is_supported" != "true" ]]; then
        error "Framework '$framework_id' is not supported for use case '$identifier'"
        return 1
    fi

    return 0
}

# Get supported frameworks for a use case
# Usage: FRAMEWORKS=$(get_supported_frameworks "B01")
#        FRAMEWORKS=$(get_supported_frameworks "kyc_banking")
#
# Arguments:
#   $1 - Use case ID or use_case_name
#
# Returns:
#   Newline-separated list of supported framework IDs
get_supported_frameworks() {
    local identifier="$1"
    jq -r ".use_cases[] | select(.id == \"$identifier\" or .use_case_name == \"$identifier\") | .supported_frameworks[]" "$REGISTRY_FILE"
}

# ============================================================================
# Deployment Pattern Functions
# ============================================================================
# Requirement 4.2: Read available patterns from the Registry
# Requirement 4.3: Validate that selected pattern is supported

# Get a deployment pattern by ID
# Usage: PATTERN_JSON=$(get_pattern "ec2")
#
# Arguments:
#   $1 - Pattern ID (e.g., "ec2", "agentcore", "step_functions")
#
# Returns:
#   JSON object of the pattern if found
#   Empty string if not found
get_pattern() {
    local pattern_id="$1"
    
    if [[ -z "$pattern_id" ]]; then
        return 1
    fi
    
    jq -r ".deployment_patterns[] | select(.id == \"$pattern_id\")" "$REGISTRY_FILE"
}

# Get all deployment pattern IDs from the registry
# Usage: PATTERN_IDS=$(get_all_pattern_ids)
#
# Returns:
#   Newline-separated list of pattern IDs
get_all_pattern_ids() {
    jq -r '.deployment_patterns[].id' "$REGISTRY_FILE"
}

# Get pattern name by ID
# Usage: NAME=$(get_pattern_name "ec2")
get_pattern_name() {
    local pattern_id="$1"
    jq -r ".deployment_patterns[] | select(.id == \"$pattern_id\") | .name" "$REGISTRY_FILE"
}

# Get pattern architecture by ID
# Usage: ARCH=$(get_pattern_architecture "ec2")
get_pattern_architecture() {
    local pattern_id="$1"
    jq -r ".deployment_patterns[] | select(.id == \"$pattern_id\") | .architecture // empty" "$REGISTRY_FILE"
}

# Get pattern IAC path by ID
# Usage: IAC_PATH=$(get_pattern_iac_path "ec2")
get_pattern_iac_path() {
    local pattern_id="$1"
    jq -r ".deployment_patterns[] | select(.id == \"$pattern_id\") | .iac_path" "$REGISTRY_FILE"
}

# Check if pattern uses Docker
# Usage: if pattern_uses_docker "ec2"; then ...
pattern_uses_docker() {
    local pattern_id="$1"
    local uses_docker
    uses_docker=$(jq -r ".deployment_patterns[] | select(.id == \"$pattern_id\") | .uses_docker" "$REGISTRY_FILE")
    [[ "$uses_docker" == "true" ]]
}

# Validate that a deployment pattern is supported for a use case
# Usage: validate_pattern_supported "B01" "ec2" || exit 1
#        validate_pattern_supported "kyc_banking" "ec2" || exit 1
#
# Arguments:
#   $1 - Use case ID or use_case_name
#   $2 - Pattern ID to validate
#
# Returns:
#   0 if pattern is supported for the use case
#   1 if pattern is not supported (prints error message)
validate_pattern_supported() {
    local identifier="$1"
    local pattern_id="$2"

    if [[ -z "$identifier" ]]; then
        error "Use case identifier is required"
        return 1
    fi

    if [[ -z "$pattern_id" ]]; then
        error "DEPLOYMENT_PATTERN is required"
        return 1
    fi

    # First check if use case exists
    if ! validate_use_case_exists "$identifier" 2>/dev/null; then
        error "Use case '$identifier' not found in registry"
        return 1
    fi

    # Check if pattern is in the use case's supported_patterns array
    local is_supported
    is_supported=$(jq -r ".use_cases[] | select(.id == \"$identifier\" or .use_case_name == \"$identifier\") | .supported_patterns | index(\"$pattern_id\") != null" "$REGISTRY_FILE")

    if [[ "$is_supported" != "true" ]]; then
        error "Deployment pattern '$pattern_id' is not supported for use case '$identifier'"
        return 1
    fi

    return 0
}

# Get supported patterns for a use case
# Usage: PATTERNS=$(get_supported_patterns "B01")
#        PATTERNS=$(get_supported_patterns "kyc_banking")
#
# Arguments:
#   $1 - Use case ID or use_case_name
#
# Returns:
#   Newline-separated list of supported pattern IDs
get_supported_patterns() {
    local identifier="$1"
    jq -r ".use_cases[] | select(.id == \"$identifier\" or .use_case_name == \"$identifier\") | .supported_patterns[]" "$REGISTRY_FILE"
}

# ============================================================================
# Combined Validation
# ============================================================================

# Validate a complete deployment configuration
# Usage: validate_deployment_config "B01" "langchain_langgraph" "ec2" || exit 1
#        validate_deployment_config "kyc_banking" "langchain_langgraph" "ec2" || exit 1
#
# Arguments:
#   $1 - Use case ID or use_case_name
#   $2 - Framework ID
#   $3 - Pattern ID
#
# Returns:
#   0 if configuration is valid
#   1 if any validation fails (prints error messages)
validate_deployment_config() {
    local identifier="$1"
    local framework_id="$2"
    local pattern_id="$3"

    # Validate use case exists
    validate_use_case_exists "$identifier" || return 1

    # Validate framework is supported
    validate_framework_supported "$identifier" "$framework_id" || return 1

    # Validate pattern is supported
    validate_pattern_supported "$identifier" "$pattern_id" || return 1

    return 0
}
