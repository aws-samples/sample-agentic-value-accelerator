###############################################################################
# Harness execution role
#
# Reusable module that provisions the IAM execution role AgentCore Harness
# assumes at CreateHarness time. Policy shape mirrors the sample
# execution-role policy from
# https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-security.html
# (public-network variant; VPC-mode + optional-feature policies are opt-in).
#
# Provision one role per AVA account/region shared across every harness that
# doesn't require anything beyond the base capability set. Advanced harnesses
# that add VPC, custom container ECR, BYO memory, gateways, skill sources,
# or API-key credential providers should attach additional policies via the
# `extra_policy_arns` variable rather than fork this module.
###############################################################################

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  region     = data.aws_region.current.name
  account_id = data.aws_caller_identity.current.account_id
  role_name  = coalesce(var.role_name, "${var.name_prefix}-harness-exec-${replace(local.region, "-", "")}")
}

resource "aws_iam_role" "harness" {
  name = local.role_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "bedrock-agentcore.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = merge(
    { "ava:component" = "harness", "ava:module" = "harness_execution_role" },
    var.tags,
  )
}

# ─── Base policy (matches the docs sample for public-network harnesses) ────

resource "aws_iam_role_policy" "base" {
  name = "${local.role_name}-base"
  role = aws_iam_role.harness.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "BedrockModelInvocation"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ]
        # Scoped down to foundation models + inference profiles in this account.
        # Tighten per production workload (specific inference-profile ARNs) as needed.
        Resource = [
          "arn:aws:bedrock:*::foundation-model/*",
          "arn:aws:bedrock:${local.region}:${local.account_id}:*",
        ]
      },
      {
        Sid      = "EcrPublicTokenAccess"
        Effect   = "Allow"
        Action   = ["ecr-public:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid      = "StsForEcrPublicPull"
        Effect   = "Allow"
        Action   = ["sts:GetServiceBearerToken"]
        Resource = "*"
      },
      {
        Sid    = "XRayTracingAccess"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets",
        ]
        Resource = "*"
      },
      {
        Sid    = "CloudWatchLogsGroup"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:DescribeLogStreams",
        ]
        Resource = "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*"
      },
      {
        Sid      = "CloudWatchLogsDescribeGroups"
        Effect   = "Allow"
        Action   = ["logs:DescribeLogGroups"]
        Resource = "arn:aws:logs:${local.region}:${local.account_id}:log-group:*"
      },
      {
        Sid    = "CloudWatchLogsStream"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*"
      },
      {
        Sid      = "CloudWatchLogsPutResourcePolicy"
        Effect   = "Allow"
        Action   = ["logs:PutResourcePolicy"]
        Resource = "*"
      },
      {
        Sid      = "CloudWatchMetricsPublish"
        Effect   = "Allow"
        Action   = "cloudwatch:PutMetricData"
        Resource = "*"
        Condition = {
          StringEquals = { "cloudwatch:namespace" = "bedrock-agentcore" }
        }
      },
      {
        Sid    = "AgentCoreWorkloadIdentity"
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:GetWorkloadAccessToken",
          "bedrock-agentcore:GetWorkloadAccessTokenForJWT",
        ]
        Resource = [
          "arn:aws:bedrock-agentcore:${local.region}:${local.account_id}:workload-identity-directory/default",
          "arn:aws:bedrock-agentcore:${local.region}:${local.account_id}:workload-identity-directory/default/workload-identity/harness_*",
        ]
      },
      {
        Sid    = "AgentCoreBrowserDefault"
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:StartBrowserSession",
          "bedrock-agentcore:StopBrowserSession",
          "bedrock-agentcore:GetBrowserSession",
          "bedrock-agentcore:ListBrowserSessions",
          "bedrock-agentcore:UpdateBrowserStream",
          "bedrock-agentcore:ConnectBrowserAutomationStream",
          "bedrock-agentcore:ConnectBrowserLiveViewStream",
        ]
        Resource = "arn:aws:bedrock-agentcore:${local.region}:aws:browser/*"
      },
      {
        Sid    = "AgentCoreCodeInterpreterDefault"
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:StartCodeInterpreterSession",
          "bedrock-agentcore:StopCodeInterpreterSession",
          "bedrock-agentcore:GetCodeInterpreterSession",
          "bedrock-agentcore:ListCodeInterpreterSessions",
          "bedrock-agentcore:InvokeCodeInterpreter",
        ]
        Resource = "arn:aws:bedrock-agentcore:${local.region}:aws:code-interpreter/*"
      },
      {
        Sid    = "AgentCoreMemory"
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:CreateEvent",
          "bedrock-agentcore:DeleteEvent",
          "bedrock-agentcore:GetEvent",
          "bedrock-agentcore:ListEvents",
          "bedrock-agentcore:RetrieveMemoryRecords",
        ]
        Resource = "arn:aws:bedrock-agentcore:${local.region}:${local.account_id}:memory/harness_*"
      },
    ]
  })
}

# Optional guardrail attachment — a Bedrock guardrail can only be used from
# an execution role that explicitly allows ApplyGuardrail on that guardrail's
# ARN. Callers pass the guardrail ARNs the harness may attach at runtime.
resource "aws_iam_role_policy" "guardrails" {
  count = length(var.guardrail_arns) > 0 ? 1 : 0

  name = "${local.role_name}-guardrails"
  role = aws_iam_role.harness.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "bedrock:ApplyGuardrail"
      Resource = var.guardrail_arns
    }]
  })
}

# Optional extras — attach whatever additional AWS-managed or customer-managed
# policies the caller supplies. Keeps the base module thin.
resource "aws_iam_role_policy_attachment" "extras" {
  for_each   = toset(var.extra_policy_arns)
  role       = aws_iam_role.harness.name
  policy_arn = each.value
}
