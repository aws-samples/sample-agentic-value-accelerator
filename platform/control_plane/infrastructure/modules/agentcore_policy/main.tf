# AgentCore Policy Engine + Platform Gateway
#
# Provisions a single account-region AgentCore Policy Engine and a
# platform-level AgentCore Gateway. The backend's /policies API targets
# the policy engine for CRUD and bakes the gateway ARN into Cedar
# statements as the resource being protected.
#
# Implemented via null_resource + aws CLI because terraform-provider-aws
# (5.x) does not yet expose `aws_bedrockagentcore_policy_engine` or
# `aws_bedrockagentcore_gateway` as native resources. Pattern mirrors
# modules/agent_registry.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  # AgentCore Policy Engine name regex: ^[A-Za-z][A-Za-z0-9_]*$ — underscores only.
  policy_engine_name = "${replace(var.name_prefix, "-", "_")}_policy_engine"
  # AgentCore Gateway name regex: ([0-9a-zA-Z][-]?){1,48} — hyphens OK, no underscores.
  # Trim to <=48 chars by using a short suffix.
  gateway_name       = "${var.name_prefix}-gw"
  gateway_role_name  = "${var.name_prefix}-agentcore-gateway-role"
}

# ----------------------------------------------------------------------------
# Gateway IAM Role
# ----------------------------------------------------------------------------

resource "aws_iam_role" "gateway" {
  name = local.gateway_role_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "bedrock-agentcore.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = {
          "aws:SourceAccount" = data.aws_caller_identity.current.account_id
        }
        ArnLike = {
          "aws:SourceArn" = "arn:aws:bedrock-agentcore:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:gateway/*"
        }
      }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "gateway" {
  name = "agentcore-gateway-policy"
  role = aws_iam_role.gateway.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "InvokeLambda"
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = ["*"]
      },
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["arn:aws:logs:*:*:*"]
      },
      {
        # Gateway-create validator (and ongoing gateway request authorization)
        # call several AgentCore policy-engine actions:
        #   GetPolicyEngine, ListPolicies, AuthorizeAction,
        #   PartiallyAuthorizeActions, etc. AWS may add more over time —
        #   wildcard the namespace on the policy engine resource.
        Sid    = "PolicyEngineFullAccess"
        Effect = "Allow"
        Action = ["bedrock-agentcore:*"]
        Resource = ["*"]
      },
    ]
  })
}

# ----------------------------------------------------------------------------
# Policy Engine
# ----------------------------------------------------------------------------

resource "null_resource" "policy_engine" {
  triggers = {
    name   = local.policy_engine_name
    region = data.aws_region.current.name
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -euo pipefail
      REGION="${data.aws_region.current.name}"
      NAME="${local.policy_engine_name}"

      EXISTING=$(aws bedrock-agentcore-control list-policy-engines \
        --region "$REGION" \
        --query "policyEngines[?name=='$NAME'].policyEngineId | [0]" \
        --output text 2>/dev/null || echo "None")

      if [ "$EXISTING" != "None" ] && [ -n "$EXISTING" ]; then
        echo "Policy engine already exists: $EXISTING"
        ARN=$(aws bedrock-agentcore-control get-policy-engine \
          --policy-engine-id "$EXISTING" --region "$REGION" \
          --query 'policyEngineArn' --output text)
        echo "$EXISTING" > ${path.module}/.policy_engine_id
        echo "$ARN"      > ${path.module}/.policy_engine_arn
        exit 0
      fi

      ID=$(aws bedrock-agentcore-control create-policy-engine \
        --name "$NAME" \
        --description "Platform-level policy engine for FSI Agent Kit (managed by terraform)" \
        --region "$REGION" \
        --query 'policyEngineId' --output text)

      ARN=$(aws bedrock-agentcore-control get-policy-engine \
        --policy-engine-id "$ID" --region "$REGION" \
        --query 'policyEngineArn' --output text)

      echo "Created policy engine: $ID ($ARN)"
      echo "$ID"  > ${path.module}/.policy_engine_id
      echo "$ARN" > ${path.module}/.policy_engine_arn

      # Wait for ACTIVE
      for i in $(seq 1 30); do
        STATUS=$(aws bedrock-agentcore-control get-policy-engine \
          --policy-engine-id "$ID" --region "$REGION" \
          --query 'status' --output text 2>/dev/null || echo "UNKNOWN")
        echo "  policy engine status: $STATUS (attempt $i/30)"
        if [ "$STATUS" = "ACTIVE" ]; then break; fi
        sleep 4
      done
    EOT
  }

  provisioner "local-exec" {
    when    = destroy
    command = <<-EOT
      set -euo pipefail
      REGION="${self.triggers.region}"
      NAME="${self.triggers.name}"

      ID=$(aws bedrock-agentcore-control list-policy-engines \
        --region "$REGION" \
        --query "policyEngines[?name=='$NAME'].policyEngineId | [0]" \
        --output text 2>/dev/null || echo "None")

      if [ "$ID" = "None" ] || [ -z "$ID" ]; then
        echo "Policy engine $NAME not found — nothing to delete"
        exit 0
      fi

      aws bedrock-agentcore-control delete-policy-engine \
        --policy-engine-id "$ID" --region "$REGION" || true
    EOT
  }
}

data "local_file" "policy_engine_id" {
  filename   = "${path.module}/.policy_engine_id"
  depends_on = [null_resource.policy_engine]
}

data "local_file" "policy_engine_arn" {
  filename   = "${path.module}/.policy_engine_arn"
  depends_on = [null_resource.policy_engine]
}

# ----------------------------------------------------------------------------
# Platform Gateway
# ----------------------------------------------------------------------------

resource "null_resource" "gateway" {
  triggers = {
    name       = local.gateway_name
    region     = data.aws_region.current.name
    role_arn   = aws_iam_role.gateway.arn
    engine_arn = trimspace(data.local_file.policy_engine_arn.content)
  }

  depends_on = [
    aws_iam_role_policy.gateway,
    null_resource.policy_engine,
  ]

  provisioner "local-exec" {
    command = <<-EOT
      set -euo pipefail
      REGION="${data.aws_region.current.name}"
      NAME="${local.gateway_name}"
      ROLE_ARN="${aws_iam_role.gateway.arn}"
      ENGINE_ARN="${trimspace(data.local_file.policy_engine_arn.content)}"

      EXISTING_ID=$(aws bedrock-agentcore-control list-gateways \
        --region "$REGION" \
        --query "items[?name=='$NAME'].gatewayId | [0]" \
        --output text 2>/dev/null || echo "None")

      if [ "$EXISTING_ID" != "None" ] && [ -n "$EXISTING_ID" ]; then
        echo "Gateway already exists: $EXISTING_ID"
        ARN=$(aws bedrock-agentcore-control get-gateway \
          --gateway-identifier "$EXISTING_ID" --region "$REGION" \
          --query 'gatewayArn' --output text)
        echo "$ARN" > ${path.module}/.gateway_arn
        echo "$EXISTING_ID" > ${path.module}/.gateway_id
        exit 0
      fi

      # IAM eventual consistency: AgentCore validator may not see the new
      # policy on the gateway role for ~10-20s after attach.
      echo "Waiting 25s for IAM policy propagation..."
      sleep 25

      ID=$(aws bedrock-agentcore-control create-gateway \
        --name "$NAME" \
        --description "Platform-level FSI Agent Kit gateway (managed by terraform)" \
        --role-arn "$ROLE_ARN" \
        --protocol-type MCP \
        --authorizer-type NONE \
        --policy-engine-configuration "arn=$ENGINE_ARN,mode=ENFORCE" \
        --region "$REGION" \
        --query 'gatewayId' --output text)

      ARN=$(aws bedrock-agentcore-control get-gateway \
        --gateway-identifier "$ID" --region "$REGION" \
        --query 'gatewayArn' --output text)

      echo "Created gateway: $ID ($ARN)"
      echo "$ARN" > ${path.module}/.gateway_arn
      echo "$ID"  > ${path.module}/.gateway_id
    EOT
  }

  provisioner "local-exec" {
    when    = destroy
    command = <<-EOT
      set -euo pipefail
      REGION="${self.triggers.region}"
      NAME="${self.triggers.name}"

      ID=$(aws bedrock-agentcore-control list-gateways \
        --region "$REGION" \
        --query "items[?name=='$NAME'].gatewayId | [0]" \
        --output text 2>/dev/null || echo "None")

      if [ "$ID" = "None" ] || [ -z "$ID" ]; then
        echo "Gateway $NAME not found — nothing to delete"
        exit 0
      fi

      aws bedrock-agentcore-control delete-gateway \
        --gateway-identifier "$ID" --region "$REGION" || true
    EOT
  }
}

data "local_file" "gateway_arn" {
  filename   = "${path.module}/.gateway_arn"
  depends_on = [null_resource.gateway]
}

data "local_file" "gateway_id" {
  filename   = "${path.module}/.gateway_id"
  depends_on = [null_resource.gateway]
}
