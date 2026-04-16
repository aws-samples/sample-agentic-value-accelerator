#!/bin/bash

# ============================================================================
# AVA - Interactive Cleanup CLI
# ============================================================================
# Scans for deployed use cases and lets you select which one to destroy.
# Only shows actually deployed workspaces — no guessing.
#
# Usage:
#   ./cleanup.sh              # Interactive mode
#   ./cleanup.sh --help       # Show help
#   ./cleanup.sh --skip-confirm  # Skip confirmation prompts
#
# Requirements: 4.8
# ============================================================================

set -e

# ============================================================================
# Script Initialization
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

# ============================================================================
# Source Library Modules
# ============================================================================

source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/common.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/variables.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"

# ============================================================================
# Help
# ============================================================================

show_help() {
    show_banner
    echo "Usage: ./cleanup.sh [options]"
    echo ""
    echo "Scans for deployed use cases and lets you select which to destroy."
    echo ""
    echo "Options:"
    echo "  --skip-confirm   Skip confirmation prompts"
    echo "  --help           Show this help message"
    echo ""
}

# ============================================================================
# Scan for Deployed Workspaces
# ============================================================================

# Discover all deployed workspaces by scanning terraform.tfstate.d directories.
# Returns lines of: pattern|workspace_name
# e.g. "agentcore|r03-langgraph-us-east-1"
scan_deployed_workspaces() {
    local iac_base="$PROJECT_ROOT/applications/fsi_foundry/foundations/iac"
    local seen=()

    # Patterns with sub-modules (agentcore has infra/runtime/ui)
    # We scan all terraform.tfstate.d dirs and deduplicate
    while IFS= read -r tfstate_dir; do
        [[ -z "$tfstate_dir" ]] && continue

        # Determine the pattern from the path
        # e.g. .../iac/agentcore/infra/terraform.tfstate.d -> agentcore
        # e.g. .../iac/ec2/terraform.tfstate.d -> ec2
        local rel_path="${tfstate_dir#$iac_base/}"
        local pattern="${rel_path%%/*}"

        # List workspace directories (each subdir = one workspace)
        for ws_dir in "$tfstate_dir"/*/; do
            [[ ! -d "$ws_dir" ]] && continue
            local ws_name
            ws_name=$(basename "$ws_dir")
            [[ "$ws_name" == "default" ]] && continue

            local key="${pattern}|${ws_name}"
            # Deduplicate (agentcore has infra+runtime+ui with same workspace)
            local already_seen=false
            for s in "${seen[@]}"; do
                if [[ "$s" == "$key" ]]; then
                    already_seen=true
                    break
                fi
            done
            if [[ "$already_seen" == "false" ]]; then
                seen+=("$key")
                echo "$key"
            fi
        done
    done < <(find "$iac_base" -name "terraform.tfstate.d" -type d 2>/dev/null)
}

# Parse a workspace name into components.
# Workspace format: {id_lowercase}-{framework_short}-{region}
# e.g. "r03-langgraph-us-east-1" -> id=r03, fw=langgraph, region=us-east-1
parse_workspace() {
    local ws="$1"
    # Region is always the last 3 hyphen-separated parts: xx-xxxx-N
    if [[ "$ws" =~ ^(.+)-([a-z]+)-([a-z]+-[a-z]+-[0-9]+)$ ]]; then
        WS_ID="${BASH_REMATCH[1]}"
        WS_FRAMEWORK_SHORT="${BASH_REMATCH[2]}"
        WS_REGION="${BASH_REMATCH[3]}"
        return 0
    fi
    return 1
}

# Map a short ID (e.g. "r03") back to the registry display name and use_case_name.
# Sets DISPLAY_NAME and USE_CASE_NAME_FIELD.
resolve_use_case_from_id() {
    local short_id="$1"
    # Registry IDs are uppercase (R03), workspace IDs are lowercase (r03)
    local upper_id
    upper_id=$(echo "$short_id" | tr '[:lower:]' '[:upper:]')

    DISPLAY_NAME=$(jq -r ".use_cases[] | select(.id==\"$upper_id\") | .name // empty" "$REGISTRY_FILE")
    USE_CASE_NAME_FIELD=$(jq -r ".use_cases[] | select(.id==\"$upper_id\") | .use_case_name // empty" "$REGISTRY_FILE")

    if [[ -z "$DISPLAY_NAME" ]]; then
        DISPLAY_NAME="$short_id"
    fi
    if [[ -z "$USE_CASE_NAME_FIELD" ]]; then
        USE_CASE_NAME_FIELD="$short_id"
    fi
}

# Map framework short name to full framework ID
resolve_framework_from_short() {
    local short="$1"
    FRAMEWORK_ID=$(jq -r ".frameworks[] | select(.short_name==\"$short\") | .id // empty" "$REGISTRY_FILE")
    FRAMEWORK_DISPLAY=$(jq -r ".frameworks[] | select(.short_name==\"$short\") | .name // empty" "$REGISTRY_FILE")

    if [[ -z "$FRAMEWORK_ID" ]]; then
        FRAMEWORK_ID="$short"
    fi
    if [[ -z "$FRAMEWORK_DISPLAY" ]]; then
        FRAMEWORK_DISPLAY="$short"
    fi
}

# Map pattern ID to display name
resolve_pattern_name() {
    local pat="$1"
    PATTERN_DISPLAY=$(get_pattern_name "$pat" 2>/dev/null)
    if [[ -z "$PATTERN_DISPLAY" || "$PATTERN_DISPLAY" == "null" ]]; then
        PATTERN_DISPLAY="$pat"
    fi
}

# ============================================================================
# Parse Arguments
# ============================================================================

SKIP_CONFIRMATION="${SKIP_CONFIRMATION:-false}"

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-confirm)
            SKIP_CONFIRMATION="true"
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

# Check prerequisites
if ! check_command "jq" "jq"; then
    die "jq is required but not installed. Install with: brew install jq"
fi

if ! validate_registry; then
    die "Registry validation failed. Please check $REGISTRY_FILE"
fi

# Show banner
show_banner

echo -e "${YELLOW}Scanning for deployed use cases...${NC}"
echo ""

# Scan for deployed workspaces
deployments=()
while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    deployments+=("$line")
done < <(scan_deployed_workspaces)

if [[ ${#deployments[@]} -eq 0 ]]; then
    echo -e "${GREEN}No deployed use cases found. Nothing to clean up.${NC}"
    echo ""
    exit 0
fi

# ============================================================================
# Display Deployed Use Cases
# ============================================================================

section "Deployed Use Cases"
echo ""

count=1
for entry in "${deployments[@]}"; do
    local_pattern="${entry%%|*}"
    local_ws="${entry#*|}"

    if parse_workspace "$local_ws"; then
        resolve_use_case_from_id "$WS_ID"
        resolve_framework_from_short "$WS_FRAMEWORK_SHORT"
        resolve_pattern_name "$local_pattern"

        echo -e "  ${BOLD}[$count]${NC} ${CYAN}$DISPLAY_NAME${NC}"
        echo -e "      Pattern: $PATTERN_DISPLAY  |  Framework: $FRAMEWORK_DISPLAY  |  Region: $WS_REGION"
        echo ""
    else
        echo -e "  ${BOLD}[$count]${NC} ${CYAN}$local_ws${NC} ($local_pattern)"
        echo ""
    fi
    ((count++))
done

# ============================================================================
# Select Deployment to Destroy
# ============================================================================

max=$((count - 1))
while true; do
    echo -ne "${YELLOW}Select deployment to destroy [1-$max]:${NC} "
    read -r selection

    if [[ "$selection" =~ ^[0-9]+$ ]] && [ "$selection" -ge 1 ] && [ "$selection" -le "$max" ]; then
        break
    else
        echo -e "${RED}Invalid selection. Please enter a number between 1 and $max${NC}"
    fi
done

# ============================================================================
# Resolve Selection
# ============================================================================

selected_entry="${deployments[$((selection-1))]}"
selected_pattern="${selected_entry%%|*}"
selected_ws="${selected_entry#*|}"

parse_workspace "$selected_ws"
resolve_use_case_from_id "$WS_ID"
resolve_framework_from_short "$WS_FRAMEWORK_SHORT"
resolve_pattern_name "$selected_pattern"

echo ""
success "Selected: $DISPLAY_NAME ($selected_pattern / $FRAMEWORK_DISPLAY / $WS_REGION)"
echo ""

# ============================================================================
# Confirm and Execute
# ============================================================================

section "Cleanup Summary"
echo ""
echo -e "  ${BLUE}Use Case:${NC}     $DISPLAY_NAME"
echo -e "  ${BLUE}Framework:${NC}    $FRAMEWORK_DISPLAY"
echo -e "  ${BLUE}Pattern:${NC}      $PATTERN_DISPLAY ($selected_pattern)"
echo -e "  ${BLUE}Region:${NC}       $WS_REGION"
echo -e "  ${BLUE}Workspace:${NC}    $selected_ws"
echo -e "  ${BLUE}Profile:${NC}      ${AWS_PROFILE:-default}"
echo ""

echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║  WARNING: This will DESTROY all resources for this deployment! ║${NC}"
echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ "$SKIP_CONFIRMATION" != "true" ]]; then
    if ! confirm "Are you sure you want to proceed with cleanup?"; then
        echo ""
        info "Cleanup cancelled"
        exit 0
    fi
fi

echo ""

# ============================================================================
# Export Variables and Execute Cleanup Script
# ============================================================================

export USE_CASE_ID="$USE_CASE_NAME_FIELD"
export FRAMEWORK="$FRAMEWORK_ID"
export DEPLOYMENT_PATTERN="$selected_pattern"
export AWS_REGION="$WS_REGION"
export SKIP_CONFIRMATION

export_global_vars

# Map pattern to cleanup script name
pattern_script="$selected_pattern"
if [ "$selected_pattern" = "step_functions" ]; then
    pattern_script="sf"
fi

cleanup_script="$PROJECT_ROOT/applications/fsi_foundry/scripts/cleanup/cleanup_${pattern_script}.sh"

if [ ! -f "$cleanup_script" ]; then
    die "Cleanup script not found: $cleanup_script"
fi

info "Executing cleanup script: $cleanup_script"
echo ""

exec "$cleanup_script"
