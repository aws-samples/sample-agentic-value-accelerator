#!/usr/bin/env bash

# ============================================================================
# Control-plane integration — evaluation auto-enrollment
# ============================================================================
# Self-registers a successful AgentCore deployment in the AVA control plane's
# deployments table so the agent appears in Operate → Evaluation immediately,
# with no manual registration step.
#
# Best-effort BY DESIGN: an account without the control plane installed (or
# without permissions on its table) must never fail an agent deployment —
# every exit path here returns 0.
#
# Table resolution order:
#   1. $AVA_DEPLOYMENTS_TABLE (explicit override)
#   2. "fsi-control-plane-deployments" if it exists (legacy/CLI installs)
#   3. the single table whose name ends in "-deployments" (Terraform installs
#      use "<name_prefix>-deployments"); ambiguity means skip, not guess.
# ============================================================================

if [[ -n "${_CONTROL_PLANE_SH_LOADED:-}" ]]; then
    return 0
fi
_CONTROL_PLANE_SH_LOADED=1

_discover_deployments_table() {
    if [[ -n "${AVA_DEPLOYMENTS_TABLE:-}" ]]; then
        echo "$AVA_DEPLOYMENTS_TABLE"
        return 0
    fi
    local tables
    tables=$(aws dynamodb list-tables --region "$AWS_REGION" \
        --query "TableNames[?ends_with(@, '-deployments')]" --output text 2>/dev/null \
        | tr '\t' '\n' | grep -v "deployment-metadata" | grep -v '^$' || true)
    if echo "$tables" | grep -qx "fsi-control-plane-deployments"; then
        echo "fsi-control-plane-deployments"
        return 0
    fi
    if [[ $(echo "$tables" | grep -c .) -eq 1 ]]; then
        echo "$tables"
        return 0
    fi
    return 1
}

# Usage: register_with_control_plane "$RUNTIME_ARN"
# Requires: USE_CASE_ID, FRAMEWORK, AWS_REGION, REGISTRY_FILE (registry.sh),
# and info/warn/success from common.sh.
register_with_control_plane() {
    local runtime_arn="$1"
    local table
    if ! table=$(_discover_deployments_table); then
        info "No control-plane deployments table found — skipping evaluation auto-enrollment"
        return 0
    fi

    local canonical use_case_name display_name dep_id framework_name fw_short
    canonical=$(normalize_use_case_to_id "$USE_CASE_ID" 2>/dev/null || echo "$USE_CASE_ID")
    use_case_name=$(jq -r --arg id "$canonical" \
        '.use_cases[] | select(.id==$id) | .use_case_name // empty' "$REGISTRY_FILE" 2>/dev/null)
    display_name=$(jq -r --arg id "$canonical" \
        '.use_cases[] | select(.id==$id) | .name // empty' "$REGISTRY_FILE" 2>/dev/null)
    # The id must include the framework: the same use case deployed with a
    # second framework is a distinct runtime, and a shared id would silently
    # overwrite the first registration (and merge their evaluation history).
    fw_short=$(echo "$FRAMEWORK" | sed 's/langchain_langgraph/langgraph/' | tr '[:upper:]' '[:lower:]')
    dep_id="$(echo "${use_case_name:-$USE_CASE_ID}" | tr '_' '-' | tr '[:upper:]' '[:lower:]')-${fw_short}"
    display_name="${display_name:-$dep_id}"
    framework_name="$(echo "${fw_short:0:1}" | tr '[:lower:]' '[:upper:]')${fw_short:1}"
    display_name="${display_name} (${framework_name})"

    # Match the target table's key schema: Terraform installs key on pk/sk,
    # older CLI-created tables key on id. Attributes are a superset of both.
    local keys item
    keys=$(aws dynamodb describe-table --table-name "$table" --region "$AWS_REGION" \
        --query "Table.KeySchema[].AttributeName" --output text 2>/dev/null || echo "")
    item=$(jq -n --arg id "$dep_id" --arg name "$display_name" --arg fw "$framework_name" --arg arn "$runtime_arn" \
        '{id: {S: $id}, name: {S: $name}, framework: {S: $fw}, status: {S: "SUCCEEDED"}, agent_runtime_arn: {S: $arn}}')
    if echo "$keys" | grep -qw "pk"; then
        item=$(echo "$item" | jq --arg id "$dep_id" '. + {pk: {S: $id}}')
    fi
    if echo "$keys" | grep -qw "sk"; then
        item=$(echo "$item" | jq '. + {sk: {S: "METADATA"}}')
    fi

    if aws dynamodb put-item --table-name "$table" --region "$AWS_REGION" --item "$item" > /dev/null 2>&1; then
        success "Registered '$dep_id' in control plane ($table) — visible in Operate → Evaluation"
    else
        warn "Control-plane registration failed (non-fatal) — the agent runs fine; register manually in $table"
    fi
    return 0
}
