# IAM Role for AgentCore Runtime
# Include region in name to support multi-region deployments
resource "aws_iam_role" "agentcore_runtime" {
  name = "AgentCoreRuntime-${local.resource_prefix}-${local.region_suffix}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "bedrock-agentcore.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${local.resource_prefix}-agentcore-runtime-role"
    Environment = var.environment
    Region      = var.aws_region
    UseCase     = var.use_case_id
  }
}

# Attach shared policies to AgentCore role
resource "aws_iam_role_policy_attachment" "agentcore_s3" {
  role       = aws_iam_role.agentcore_runtime.name
  policy_arn = module.shared.s3_policy_arn
}

resource "aws_iam_role_policy_attachment" "agentcore_bedrock" {
  role       = aws_iam_role.agentcore_runtime.name
  policy_arn = module.shared.bedrock_policy_arn
}

resource "aws_iam_role_policy_attachment" "agentcore_cloudwatch" {
  role       = aws_iam_role.agentcore_runtime.name
  policy_arn = module.shared.cloudwatch_policy_arn
}

# Additional policy for AgentCore to read deployment packages from S3
resource "aws_iam_policy" "agentcore_code_access" {
  name        = "${local.resource_prefix}-agentcore-code-access-${local.region_suffix}"
  description = "Allow AgentCore to read deployment packages from S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ]
        Resource = "${aws_s3_bucket.agentcore_code.arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "agentcore_code" {
  role       = aws_iam_role.agentcore_runtime.name
  policy_arn = aws_iam_policy.agentcore_code_access.arn
}

# Policy for AWS X-Ray tracing (observability)
resource "aws_iam_policy" "agentcore_xray" {
  name        = "${local.resource_prefix}-agentcore-xray-${local.region_suffix}"
  description = "Allow AgentCore to send traces to AWS X-Ray"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets"
        ]
        # Note: X-Ray actions require Resource="*" per AWS documentation.
        # Condition restricts scope to the deployment region for least privilege.
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = var.aws_region
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "agentcore_xray" {
  role       = aws_iam_role.agentcore_runtime.name
  policy_arn = aws_iam_policy.agentcore_xray.arn
}

# Policy for Amazon ECR access (container images)
resource "aws_iam_policy" "agentcore_ecr" {
  name        = "${local.resource_prefix}-agentcore-ecr-${local.region_suffix}"
  description = "Allow AgentCore to pull container images from Amazon ECR"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRAuthorizationToken"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        # Note: ecr:GetAuthorizationToken requires Resource="*" per AWS documentation.
        # This action returns a token valid for all ECR repositories the principal
        # has access to. Repository-level access is controlled in the next statement.
        # See: https://docs.aws.amazon.com/AmazonECR/latest/userguide/security_iam_id-based-policy-examples.html
        Resource = "*"
      },
      {
        Sid    = "ECRRepositoryAccess"
        Effect = "Allow"
        Action = [
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchCheckLayerAvailability"
        ]
        # Scoped to specific ECR repository (least privilege)
        Resource = aws_ecr_repository.agentcore.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "agentcore_ecr" {
  role       = aws_iam_role.agentcore_runtime.name
  policy_arn = aws_iam_policy.agentcore_ecr.arn
}

# Policy for Secrets Manager access:
#   * *langfuse*  — Langfuse API keys for OTEL tracing
#   * llm-gateway-* — LLM Gateway virtual keys (LiteLLM virtual-key per
#                    deployed use case, minted at deploy time by the control
#                    plane and resolved at runtime by foundations/src/utils/
#                    llm_gateway.py:resolve_gateway_api_key)
#
# Bedrock invoke perms are retained on the shared bedrock_policy (attached
# above as agentcore_bedrock) as a transitional fallback while teams migrate
# to the gateway. Once gateway-routing is validated in production for one
# release cycle, swap that attachment for a "deny direct bedrock:Invoke*"
# policy to make the gateway a hard chokepoint.
resource "aws_iam_policy" "agentcore_secrets" {
  name        = "${local.resource_prefix}-agentcore-secrets-${local.region_suffix}"
  description = "Allow AgentCore to read Langfuse keys + LLM Gateway virtual keys from Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LangfuseTracingKeys"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:*langfuse*"
      },
      {
        Sid    = "LlmGatewayVirtualKeys"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:llm-gateway-*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "agentcore_secrets" {
  role       = aws_iam_role.agentcore_runtime.name
  policy_arn = aws_iam_policy.agentcore_secrets.arn
}

# ---------------------------------------------------------------------------
# Governance services — direct invoke
#
# The four governance Lambdas (deterministic-check, sanctions-pep serving both
# sanctions and PEP, policy-cascade, llm-judge) used to be fronted by public HTTP
# APIs with no authorizer: anyone who discovered a URL could screen names against
# the sanctions list, read the match thresholds out of the responses, or run the
# LLM judge on this account's Bedrock budget. The APIs are gone; the runtime now
# invokes the functions directly and this grant is the only thing that authorises
# a call.
#
# Scoped to the governance prefix rather than "*" so the runtime cannot invoke
# unrelated functions in the account. The names are fixed by the governance
# templates as ${ResourcePrefix}-<service>, with ResourcePrefix defaulting to
# kyc-gov, so they are predictable without a cross-stack reference.
resource "aws_iam_policy" "agentcore_governance_invoke" {
  name        = "${local.resource_prefix}-agentcore-gov-invoke-${local.region_suffix}"
  description = "Allow the AgentCore runtime to invoke the kyc-gov governance Lambdas (no public endpoints)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "InvokeGovernanceServices"
        Effect = "Allow"
        Action = ["lambda:InvokeFunction"]
        Resource = [
          "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${var.governance_resource_prefix}-deterministic-check",
          "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${var.governance_resource_prefix}-sanctions-check",
          "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${var.governance_resource_prefix}-policy-cascade",
          "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${var.governance_resource_prefix}-llm-judge",
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "agentcore_governance_invoke" {
  role       = aws_iam_role.agentcore_runtime.name
  policy_arn = aws_iam_policy.agentcore_governance_invoke.arn
}
