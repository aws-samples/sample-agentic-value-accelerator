#!/usr/bin/env bash
#
# load_policies.sh â€” Load the .cedar files in ./policies into the AgentCore
# Gateway's Amazon Verified Permissions (AVP) policy store as STATIC policies.
#
# WHY (policy-as-data): the 19 Cedar policy bodies are today ALSO baked inline
# into template-cfn.yaml (the deployed source of truth). This loader lets the
# .cedar files on disk be loaded/refreshed into AVP directly â€” the first step
# toward making policy versioned, business-configurable DATA instead of
# SDLC-locked CloudFormation.
#
# ADDITIVE / SAFE: this script only ADDS policies to an existing store. It does
# NOT remove the inline CFN policies. Removing those from template-cfn.yaml is a
# deliberate, separately deploy-verified step (see NOTE at the bottom) so we
# never leave the store empty and the agent ungoverned.
#
# A .cedar file may hold MULTIPLE statements (org/app/req each have 6). AVP static
# policies accept exactly ONE statement, so each file is split on ';' and each
# statement becomes its own policy, described by its leading // comment.
#
# Usage:
#   ./load_policies.sh [--store-id <id>] [--region us-east-1] \
#                      [--environment production] [--dry-run]
#
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="production"
STORE_ID=""
DRY_RUN=0
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICY_DIR="${HERE}/policies"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --store-id)    STORE_ID="$2"; shift 2 ;;
    --region)      REGION="$2"; shift 2 ;;
    --environment) ENVIRONMENT="$2"; shift 2 ;;
    --dry-run)     DRY_RUN=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# â”€â”€ Resolve store id: --store-id  â†’  SSM parameter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if [[ -z "$STORE_ID" ]]; then
  STORE_ID="$(aws ssm get-parameter \
    --name "/agentcore/${ENVIRONMENT}/gateway-cedar-policy-store-id" \
    --region "$REGION" --query 'Parameter.Value' --output text 2>/dev/null || true)"
fi
if [[ -z "$STORE_ID" || "$STORE_ID" == "None" ]]; then
  echo "ERROR: no policy store id. Pass --store-id <id> or ensure SSM" >&2
  echo "       /agentcore/${ENVIRONMENT}/gateway-cedar-policy-store-id exists" >&2
  echo "       (deploy template-cfn.yaml first â€” it creates the store + schema)." >&2
  exit 1
fi
echo "[INFO] Target AVP policy store: $STORE_ID (region $REGION)"

# â”€â”€ SCHEMA PRE-CHECK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# STRICT stores reject any policy referencing entity types / actions absent from
# the schema. Fail fast BEFORE creating anything, so we never leave a partial or
# inconsistent policy set.
echo "[CHECK] Verifying policy store and schema ..."
MODE="$(aws verifiedpermissions get-policy-store --policy-store-id "$STORE_ID" \
  --region "$REGION" --query 'validationSettings.mode' --output text 2>/dev/null || true)"
if [[ -z "$MODE" ]]; then
  echo "ERROR: policy store $STORE_ID not found or not readable in $REGION." >&2
  exit 1
fi
echo "        validation mode: $MODE"
SCHEMA="$(aws verifiedpermissions get-schema --policy-store-id "$STORE_ID" \
  --region "$REGION" --query 'schema' --output text 2>/dev/null || true)"
if [[ "$MODE" == "STRICT" && ( -z "$SCHEMA" || "$SCHEMA" == "None" ) ]]; then
  echo "ERROR: store is STRICT but has no schema. Deploy template-cfn.yaml" >&2
  echo "       (creates the store + schema) before loading policies." >&2
  exit 1
fi
[[ -n "$SCHEMA" && "$SCHEMA" != "None" ]] && echo "        schema present: yes" || echo "        schema present: no"

created=0
failed=0

shopt -s nullglob
for f in "${POLICY_DIR}"/*.cedar; do
  base="$(basename "$f" .cedar)"
  echo "------------------------------------------------------------"
  echo "[FILE] $(basename "$f")"

  # Split into statements: accumulate lines, capture the last non-separator //
  # comment as the description, flush a statement on each line ending in ';'.
  desc=""
  buf=""
  idx=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    trimmed="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    [[ -z "$trimmed" ]] && continue
    if [[ "$trimmed" == //* ]]; then
      if [[ -z "$(printf '%s' "$buf" | tr -d '[:space:]')" ]]; then
        c="$(printf '%s' "$trimmed" | sed -e 's#^/*##' -e 's/^[[:space:]]*//')"
        # ignore separator-only banner comments (===== / -----)
        if [[ -n "$c" && ! "$c" =~ ^[=[:space:]-]+$ ]]; then desc="$c"; fi
      fi
      continue
    fi
    buf+="$line"$'\n'
    if [[ "$trimmed" == *";" ]]; then
      idx=$((idx + 1))
      [[ -z "$desc" ]] && desc="${base} statement ${idx}"
      d="${desc:0:150}"
      stmt="$(printf '%s' "$buf" | sed -e 's/[[:space:]]*$//')"
      # Build --definition JSON with python3 (already required by this folder's
      # seed scripts); pass via env vars to avoid any quoting/escaping issues.
      defjson="$(LP_DESC="$d" LP_STMT="$stmt" python3 -c 'import json,os; print(json.dumps({"static":{"description":os.environ["LP_DESC"],"statement":os.environ["LP_STMT"]}}))')"
      if [[ "$DRY_RUN" == "1" ]]; then
        echo "   [DRY]  would create: $d"
      else
        if pid="$(aws verifiedpermissions create-policy \
                    --policy-store-id "$STORE_ID" --region "$REGION" \
                    --definition "$defjson" \
                    --query 'policyId' --output text 2>/tmp/avp_load_err)"; then
          echo "   [OK]   $d -> $pid"
          created=$((created + 1))
        else
          echo "   [FAIL] $d"
          sed 's/^/          /' /tmp/avp_load_err || true
          failed=$((failed + 1))
        fi
      fi
      buf=""
      desc=""
    fi
  done < "$f"
done

echo "============================================================"
echo "  LOAD COMPLETE â€” created: $created  failed: $failed"
echo "  Store: $STORE_ID"
echo "============================================================"
echo "Verify:"
echo "  aws verifiedpermissions list-policies --policy-store-id $STORE_ID --region $REGION \\"
echo "    --query \"policies[].{Id:policyId,Desc:definition.static.description}\" --output table"
echo
echo "NOTE (deliberate, NOT done here): the same 19 policies are still defined"
echo "inline in template-cfn.yaml. Removing them there (so the .cedar files become"
echo "the sole source of truth) is a separate, deploy-verified change â€” do NOT"
echo "remove the inline policies until a loaded store has been confirmed to"
echo "enforce correctly."

if [[ "$failed" -gt 0 ]]; then exit 1; fi
exit 0
