data "aws_region" "current" {}

resource "null_resource" "registry" {
  triggers = {
    name         = var.registry_name
    description  = var.registry_description
    auto_approve = tostring(var.auto_approve)
    region       = data.aws_region.current.name
    # Bump when the local-exec script logic changes so a re-apply picks
    # it up without needing a manual `terraform taint`.
    script_version = "4"
  }

  # Fail-loud registry provisioning.
  #
  # Prior versions of this script silently swallowed CLI errors and wrote a
  # placeholder ARN (`arn:...:registry/<name>`) so the apply could keep
  # going in regions where the preview `agent-registry-control` API wasn't
  # available. That masked real failures in supported regions — an unknown
  # CLI verb, a missing IAM permission, or a transient 5xx would all look
  # like "successful apply, placeholder registry" and only surface later
  # when downstream Lambdas got AGENT_REGISTRY_ID="AVA" (too short for the
  # service's regex) and every CreateRegistryRecord call failed.
  #
  # New behavior:
  #   - stderr is captured and dumped inline so Terraform shows it.
  #   - if list-registries or create-registry fails, exit non-zero and
  #     abort the apply. No placeholder.
  #   - if the CLI verb itself is unknown, print a clear "upgrade the AWS
  #     CLI on the machine running terraform" hint and abort.
  provisioner "local-exec" {
    command = <<-EOT
      set -euo pipefail
      REGION="${data.aws_region.current.name}"
      NAME="${var.registry_name}"
      ARN_FILE="${path.module}/.registry_arn"

      require_cli_verb() {
        if ! aws agent-registry-control help >/dev/null 2>&1; then
          echo "ERROR: this AWS CLI does not know about 'agent-registry-control'." >&2
          echo "  CLI version: $(aws --version 2>&1)" >&2
          echo "  Fix: upgrade AWS CLI to a version that supports the preview" >&2
          echo "  service, or run terraform apply from a shell where it does." >&2
          exit 1
        fi
      }

      write_arn() {
        cleaned=$(printf '%s' "$${1:-}" | tr -d '[:space:]' | grep -o '^arn:[^[:space:]]*' || true)
        if [ -z "$cleaned" ]; then
          echo "ERROR: registry provisioning did not produce a valid ARN (got: '$${1:-<empty>}')." >&2
          exit 1
        fi
        printf '%s' "$cleaned" > "$ARN_FILE"
        echo "wrote ARN: $cleaned"
      }

      require_cli_verb

      # Idempotency probe. Use JSON + python parse rather than the CLI's
      # jmespath `--query ... --output text` shortcut, because aws-cli
      # v2.36+ emits a stray extra "None\n" line for the
      # `registries[?name==].registryArn | [0]` expression when the list
      # is empty — which fell through the string-equality check and got
      # interpreted as a "found" ARN by downstream logic. Passing the raw
      # JSON to python gives us an unambiguous result.
      LIST_JSON=$(mktemp)
      LIST_STDERR=$(mktemp)
      aws agent-registry-control list-registries \
        --region "$REGION" \
        --output json >"$LIST_JSON" 2>"$LIST_STDERR" || {
        echo "ERROR: list-registries failed in $REGION." >&2
        cat "$LIST_STDERR" >&2
        rm -f "$LIST_JSON" "$LIST_STDERR"
        exit 1
      }
      rm -f "$LIST_STDERR"

      EXISTING_ARN=$(python3 -c "
import json, sys
with open('$LIST_JSON') as f:
    data = json.load(f)
for r in data.get('registries', []):
    if r.get('name') == '$NAME':
        print(r.get('registryArn', ''))
        break
" 2>&1)
      rm -f "$LIST_JSON"

      if [ -n "$EXISTING_ARN" ] && [ "$${EXISTING_ARN#arn:}" != "$EXISTING_ARN" ]; then
        echo "Registry already exists: $EXISTING_ARN"
        write_arn "$EXISTING_ARN"
        exit 0
      fi

      APPROVAL_FLAG=""
      if [ "${var.auto_approve}" = "true" ]; then
        APPROVAL_FLAG='--approval-configuration autoApproval=true'
      fi

      # Create the registry. Fail loud on error.
      CREATE_STDERR=$(mktemp)
      ARN=$(aws agent-registry-control create-registry \
        --name "$NAME" \
        --description "${var.registry_description}" \
        $APPROVAL_FLAG \
        --region "$REGION" \
        --query 'registryArn' --output text 2>"$CREATE_STDERR") || {
        echo "ERROR: create-registry failed for name='$NAME' in $REGION." >&2
        cat "$CREATE_STDERR" >&2
        rm -f "$CREATE_STDERR"
        exit 1
      }
      rm -f "$CREATE_STDERR"

      if [ "$ARN" = "None" ] || [ -z "$ARN" ]; then
        echo "ERROR: create-registry returned no ARN (name='$NAME', region='$REGION')." >&2
        exit 1
      fi

      echo "Created registry: $ARN"
      write_arn "$ARN"
    EOT
  }

  provisioner "local-exec" {
    when    = destroy
    command = <<-EOT
      set -euo pipefail
      REGION="${self.triggers.region}"
      NAME="${self.triggers.name}"

      ARN=$(aws agent-registry-control list-registries \
        --region "$REGION" \
        --query "registries[?name=='$NAME'].registryArn | [0]" \
        --output text 2>/dev/null || echo "None")

      if [ "$ARN" = "None" ] || [ -z "$ARN" ]; then
        echo "Registry $NAME not found — nothing to delete"
        exit 0
      fi

      echo "Deleting records in $ARN before registry delete..."
      RECORDS=$(aws agent-registry-control list-registry-records \
        --registry-id "$ARN" --region "$REGION" \
        --query 'records[].recordArn' --output text 2>/dev/null || true)
      for R in $RECORDS; do
        aws agent-registry-control delete-registry-record \
          --record-id "$R" --region "$REGION" || true
      done

      aws agent-registry-control delete-registry \
        --registry-id "$ARN" --region "$REGION" || true
    EOT
  }
}

data "local_file" "registry_arn" {
  filename   = "${path.module}/.registry_arn"
  depends_on = [null_resource.registry]
}
