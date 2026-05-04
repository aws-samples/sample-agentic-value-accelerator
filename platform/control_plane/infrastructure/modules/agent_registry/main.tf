data "aws_region" "current" {}

resource "null_resource" "registry" {
  triggers = {
    name          = var.registry_name
    description   = var.registry_description
    auto_approve  = tostring(var.auto_approve)
    region        = data.aws_region.current.name
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -euo pipefail
      REGION="${data.aws_region.current.name}"
      NAME="${var.registry_name}"

      # Check if a registry with this name already exists (idempotent).
      EXISTING_ARN=$(aws bedrock-agentcore-control list-registries \
        --region "$REGION" \
        --query "registries[?name=='$NAME'].registryArn | [0]" \
        --output text 2>/dev/null || echo "None")

      if [ "$EXISTING_ARN" != "None" ] && [ -n "$EXISTING_ARN" ]; then
        echo "Registry already exists: $EXISTING_ARN"
        echo "$EXISTING_ARN" > ${path.module}/.registry_arn
        exit 0
      fi

      APPROVAL_FLAG=""
      if [ "${var.auto_approve}" = "true" ]; then
        APPROVAL_FLAG='--approval-configuration autoApproval=true'
      fi

      ARN=$(aws bedrock-agentcore-control create-registry \
        --name "$NAME" \
        --description "${var.registry_description}" \
        $APPROVAL_FLAG \
        --region "$REGION" \
        --query 'registryArn' --output text)

      echo "Created registry: $ARN"
      echo "$ARN" > ${path.module}/.registry_arn
    EOT
  }

  provisioner "local-exec" {
    when    = destroy
    command = <<-EOT
      set -euo pipefail
      REGION="${self.triggers.region}"
      NAME="${self.triggers.name}"

      ARN=$(aws bedrock-agentcore-control list-registries \
        --region "$REGION" \
        --query "registries[?name=='$NAME'].registryArn | [0]" \
        --output text 2>/dev/null || echo "None")

      if [ "$ARN" = "None" ] || [ -z "$ARN" ]; then
        echo "Registry $NAME not found — nothing to delete"
        exit 0
      fi

      echo "Deleting records in $ARN before registry delete..."
      RECORDS=$(aws bedrock-agentcore-control list-registry-records \
        --registry-id "$ARN" --region "$REGION" \
        --query 'records[].recordArn' --output text 2>/dev/null || true)
      for R in $RECORDS; do
        aws bedrock-agentcore-control delete-registry-record \
          --record-id "$R" --region "$REGION" || true
      done

      aws bedrock-agentcore-control delete-registry \
        --registry-id "$ARN" --region "$REGION" || true
    EOT
  }
}

data "local_file" "registry_arn" {
  filename   = "${path.module}/.registry_arn"
  depends_on = [null_resource.registry]
}
