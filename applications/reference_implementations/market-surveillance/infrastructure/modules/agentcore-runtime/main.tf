# Data source for current AWS account
data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

# Look up each subnet to determine its availability zone ID
data "aws_subnet" "selected" {
  for_each = toset(var.subnet_ids)
  id       = each.value
}

# Filter subnets to only those in AZs supported by the Code Interpreter
locals {
  code_interpreter_subnet_ids = [
    for id, subnet in data.aws_subnet.selected :
    id if contains(var.code_interpreter_supported_az_ids, subnet.availability_zone_id)
  ]
}

# IAM Role for AgentCore Runtime execution
resource "aws_iam_role" "agentcore_execution" {
  name = "${var.name_prefix}-agentcore-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "bedrock-agentcore.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "${var.name_prefix}-agentcore-role-${var.environment}"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# IAM Policy for VPC network interface management
# WILDCARD JUSTIFICATION: AgentCore Runtime in VPC mode creates Elastic Network Interfaces (ENIs)
# in the configured subnets to enable secure communication with private VPC resources (RDS, Secrets Manager, etc.).
# The service-linked role AWSServiceRoleForBedrockAgentCoreNetwork manages these ENIs.
# Reference: https://aws.github.io/bedrock-agentcore-starter-toolkit/user-guide/security/agentcore-vpc.md
#
# Scoping rationale per action:
# - CreateNetworkInterface: Scoped to specific subnets and security groups via resource ARNs
# - DescribeNetworkInterfaces: Does NOT support resource-level permissions (must be *)
# - DeleteNetworkInterface: ENI ARNs are dynamically created by AgentCore, cannot be pre-determined;
#   scoped via ec2:Vpc condition key to restrict to our VPC
# - AssignPrivateIpAddresses / UnassignPrivateIpAddresses: Same as Delete — dynamic ENIs;
#   scoped via ec2:Vpc condition key
resource "aws_iam_role_policy" "agentcore_vpc" {
  name = "${var.name_prefix}-agentcore-vpc-${var.environment}"
  role = aws_iam_role.agentcore_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # tfsec:ignore:aws-iam-no-policy-wildcards - DescribeNetworkInterfaces does not support resource-level permissions
        Sid    = "DescribeNetworkInterfaces"
        Effect = "Allow"
        Action = [
          "ec2:DescribeNetworkInterfaces"
        ]
        Resource = "*"
      },
      {
        Sid    = "CreateNetworkInterfaceInSubnets"
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface"
        ]
        Resource = flatten([
          [for subnet_id in var.subnet_ids : "arn:aws:ec2:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:subnet/${subnet_id}"],
          [for sg_id in var.security_group_ids : "arn:aws:ec2:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:security-group/${sg_id}"],
          ["arn:aws:ec2:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:network-interface/*"]
        ])
      },
      {
        Sid    = "ManageNetworkInterfaces"
        Effect = "Allow"
        Action = [
          "ec2:DeleteNetworkInterface",
          "ec2:AssignPrivateIpAddresses",
          "ec2:UnassignPrivateIpAddresses"
        ]
        Resource = "arn:aws:ec2:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:network-interface/*"
        Condition = {
          StringEquals = {
            "ec2:ResourceTag/aws:bedrock-agentcore:network" = "true"
          }
        }
      }
    ]
  })
}

# IAM Policy for ECR access
resource "aws_iam_role_policy" "agentcore_ecr" {
  name = "${var.name_prefix}-agentcore-ecr-${var.environment}"
  role = aws_iam_role.agentcore_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability"
        ]
        Resource = [var.container_arn]
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        # tfsec:ignore:aws-iam-no-policy-wildcards - Required for ECR access
        # This action does not accept any restrictions on the resource, per the docs:
        # https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonelasticcontainerregistry.html
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_policy" "agentcore_logs" {
  name = "${var.name_prefix}-agentcore-logging-policy-${var.environment}"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CreateLogGroup"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
        ]
        Resource = [
          "arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/*",
          "arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/vendedlogs/bedrock-agentcore/*"
        ]
      },
      {
        Sid    = "DescribeLogResources"
        Effect = "Allow"
        Action = [
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Resource = [
          "arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:*"
        ]
      },
      {
        Sid    = "WriteLogEvents"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:PutRetentionPolicy"
        ]
        Resource = [
          "arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*",
          "arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/vendedlogs/bedrock-agentcore/*:log-stream:*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "agentcore_logs" {
  role       = aws_iam_role.agentcore_execution.name
  policy_arn = aws_iam_policy.agentcore_logs.arn
}

# IAM Policy for X-Ray and CloudWatch metrics monitoring
resource "aws_iam_policy" "agentcore_monitoring" {
  name = "${var.name_prefix}-agentcore-monitoring-policy-${var.environment}"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # tfsec:ignore:aws-iam-no-policy-wildcards - Required for X-Ray tracing
        # WILDCARD JUSTIFICATION: X-Ray PutTraceSegments and PutTelemetryRecords
        # do not support resource-level permissions per AWS documentation.
        # Reference: https://docs.aws.amazon.com/xray/latest/devguide/security_iam_id-based-policy-examples.html
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets",
          "xray:UpdateTraceSegmentDestination"
        ]
        Resource = "*"
      },
      {
        # tfsec:ignore:aws-iam-no-policy-wildcards - Required for CloudWatch metrics
        # WILDCARD JUSTIFICATION: CloudWatch PutMetricData requires Resource="*"
        # as per AWS documentation. Condition restricts to bedrock-agentcore namespace only.
        # Reference: https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_PutMetricData.html
        Effect   = "Allow"
        Resource = "*"
        Action   = "cloudwatch:PutMetricData"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "bedrock-agentcore"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "agentcore_monitoring" {
  role       = aws_iam_role.agentcore_execution.name
  policy_arn = aws_iam_policy.agentcore_monitoring.arn
}

# IAM Policy for Bedrock model invocation
resource "aws_iam_role_policy" "agentcore_bedrock" {
  name = "${var.name_prefix}-agentcore-bedrock-${var.environment}"
  role = aws_iam_role.agentcore_execution.id

  # Reference: https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html
  # Cross-region inference requires wildcard region/account in ARNs because
  # requests get routed to different regions dynamically.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "InvokeModelsAndInferenceProfiles"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = [
          "arn:aws:bedrock:*::foundation-model/*",
          "arn:aws:bedrock:*:*:inference-profile/*"
        ]
      }
    ]
  })
}


# IAM Policy for SSM Parameter Store access
resource "aws_iam_role_policy" "agentcore_ssm" {
  count = length(var.ssm_parameter_arns) > 0 ? 1 : 0
  name  = "${var.name_prefix}-agentcore-ssm-${var.environment}"
  role  = aws_iam_role.agentcore_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = var.ssm_parameter_arns
      }
    ]
  })
}

# IAM Policy for S3 config bucket access
resource "aws_iam_role_policy" "agentcore_s3" {
  count = var.s3_config_bucket != "" ? 1 : 0
  name  = "${var.name_prefix}-agentcore-s3-${var.environment}"
  role  = aws_iam_role.agentcore_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.s3_config_bucket}",
          "arn:aws:s3:::${var.s3_config_bucket}/*"
        ]
      }
    ]
  })
}

# IAM Policy for S3 KMS key access (required for encrypted config bucket)
resource "aws_iam_role_policy" "agentcore_s3_kms" {
  count = var.s3_kms_key_arn != "" ? 1 : 0
  name  = "${var.name_prefix}-agentcore-s3-kms-${var.environment}"
  role  = aws_iam_role.agentcore_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:GenerateDataKey"
        ]
        Resource = var.s3_kms_key_arn
      }
    ]
  })
}

# IAM Policy for Secrets Manager access (database credentials)
resource "aws_iam_role_policy" "agentcore_secrets" {
  count = var.db_secret_arn != "" ? 1 : 0
  name  = "${var.name_prefix}-agentcore-secrets-${var.environment}"
  role  = aws_iam_role.agentcore_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = var.db_secret_arn
      }
    ]
  })
}

# IAM Policy for Secrets Manager KMS key access (required for encrypted secrets)
resource "aws_iam_role_policy" "agentcore_secrets_kms" {
  count = var.secrets_kms_key_arn != "" ? 1 : 0
  name  = "${var.name_prefix}-agentcore-secrets-kms-${var.environment}"
  role  = aws_iam_role.agentcore_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = var.secrets_kms_key_arn
      }
    ]
  })
}

# IAM Policy for AgentCore Memory access
resource "aws_iam_role_policy" "agentcore_memory" {
  count = var.enable_memory ? 1 : 0
  name  = "${var.name_prefix}-agentcore-memory-${var.environment}"
  role  = aws_iam_role.agentcore_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:GetMemory",
          "bedrock-agentcore:PutMemoryEvent",
          "bedrock-agentcore:CreateEvent",
          "bedrock-agentcore:QueryMemory",
          "bedrock-agentcore:ListMemoryStrategies",
          "bedrock-agentcore:ListEvents",
          "bedrock-agentcore:GetEvent"
        ]
        Resource = "arn:aws:bedrock-agentcore:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:memory/*"
      }
    ]
  })
}

# IAM Policy for DynamoDB access (alert conversations and summaries)
resource "aws_iam_role_policy" "agentcore_dynamodb" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0
  name  = "${var.name_prefix}-agentcore-dynamodb-${var.environment}"
  role  = aws_iam_role.agentcore_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = var.dynamodb_table_arns
      }
    ]
  })
}

# IAM Policy for DynamoDB KMS key access (required for encrypted tables)
resource "aws_iam_role_policy" "agentcore_dynamodb_kms" {
  count = var.dynamodb_kms_key_arn != "" ? 1 : 0
  name  = "${var.name_prefix}-agentcore-dynamodb-kms-${var.environment}"
  role  = aws_iam_role.agentcore_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:GenerateDataKey"
        ]
        Resource = var.dynamodb_kms_key_arn
      }
    ]
  })
}

# IAM Policy for AgentCore Code Interpreter access
resource "aws_iam_role_policy" "agentcore_code_interpreter" {
  name = "${var.name_prefix}-agentcore-code-interpreter-${var.environment}"
  role = aws_iam_role.agentcore_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:CreateCodeInterpreter",
          "bedrock-agentcore:StartCodeInterpreterSession",
          "bedrock-agentcore:InvokeCodeInterpreter",
          "bedrock-agentcore:StopCodeInterpreterSession",
          "bedrock-agentcore:DeleteCodeInterpreter",
          "bedrock-agentcore:ListCodeInterpreters",
          "bedrock-agentcore:GetCodeInterpreter",
          "bedrock-agentcore:GetCodeInterpreterSession",
          "bedrock-agentcore:ListCodeInterpreterSessions"
        ]
        Resource = [
          "arn:aws:bedrock-agentcore:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:code-interpreter-custom/*",
          "arn:aws:bedrock-agentcore:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:code-interpreter-custom/*"
        ]
      }
    ]
  })
}

# IAM Policy for AgentCore Gateway access
resource "aws_iam_role_policy" "agentcore_gateway" {
  name = "${var.name_prefix}-agentcore-gateway-${var.environment}"
  role = aws_iam_role.agentcore_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:InvokeGateway",
          "bedrock-agentcore:GetGateway",
          "bedrock-agentcore:ListGateways",
          "bedrock-agentcore:ListGatewayTargets"
        ]
        Resource = "arn:aws:bedrock-agentcore:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:gateway/*"
      }
    ]
  })
}

# IAM Policy for Bedrock Guardrail access
resource "aws_iam_role_policy" "agentcore_guardrail" {
  count = 1 #var.guardrail_arn != "" ? 1 : 0
  name  = "${var.name_prefix}-agentcore-guardrail-${var.environment}"
  role  = aws_iam_role.agentcore_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ApplyGuardrail"
        Effect = "Allow"
        Action = [
          "bedrock:ApplyGuardrail",
          "bedrock:GetGuardrail"
        ]
        Resource = var.guardrail_arn
      }
    ]
  })
}

# ============================================================================
# Code Interpreter Tool - For Python Code Execution and Data Analysis
# ============================================================================
resource "aws_bedrockagentcore_code_interpreter" "code_interpreter" {
  name        = "${replace(var.name_prefix, "-", "_")}_code_interpreter_${var.environment}"
  description = "Code interpreter for market surveillance agent to analyze trade data and perform calculations"

  execution_role_arn = aws_iam_role.agentcore_execution.arn

  network_configuration {
    network_mode = "VPC"

    vpc_config {
      security_groups = var.security_group_ids
      subnets         = local.code_interpreter_subnet_ids
    }
  }

  tags = {
    Name        = "${var.name_prefix}-code-interpreter-${var.environment}"
    Environment = var.environment
    Project     = var.name_prefix
    Module      = "AgentCore-Tools"
    Tool        = "CodeInterpreter"
  }
}

# AgentCore Runtime
resource "aws_bedrockagentcore_agent_runtime" "agent_runtime" {
  agent_runtime_name = "${replace(var.name_prefix, "-", "_")}_agent_${var.environment}"
  role_arn           = aws_iam_role.agentcore_execution.arn
  description        = var.description

  agent_runtime_artifact {
    container_configuration {
      container_uri = var.container_uri
    }
  }

  # Authorization configuration for JWT tokens
  # Note: Cognito ID tokens use 'aud' (audience) claim, not 'client_id' claim
  # So we use allowed_audience instead of allowed_clients
  authorizer_configuration {
    custom_jwt_authorizer {
      discovery_url    = var.cognito_user_pool_discovery_url
      allowed_audience = split(",", var.cognito_user_pool_client_id)
    }
  }

  network_configuration {
    network_mode = "VPC"

    network_mode_config {
      subnets         = local.code_interpreter_subnet_ids
      security_groups = var.security_group_ids
    }
  }

  protocol_configuration {
    server_protocol = var.protocol
  }

  environment_variables = merge(
    {
      "AWS_REGION"          = data.aws_region.current.id
      "AWS_DEFAULT_REGION"  = data.aws_region.current.id
      "LOG_LEVEL"           = "INFO"
      "CODE_INTERPRETER_ID" = aws_bedrockagentcore_code_interpreter.code_interpreter.code_interpreter_id
    },
    var.enable_memory ? { "BEDROCK_AGENTCORE_MEMORY_ID" = var.memory_id } : {},
    var.environment_variables
  )

  tags = {
    Name        = "${var.name_prefix}-agent-${var.environment}"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# ============================================================================
# Observability Module - CloudWatch Logs and X-Ray Traces Delivery
# ============================================================================

# ============================================================================
# Application Logs Setup
# ============================================================================

# CloudWatch Log Group for vended log delivery
resource "aws_cloudwatch_log_group" "agent_runtime_logs" {
  name              = "/aws/vendedlogs/bedrock-agentcore/${aws_bedrockagentcore_agent_runtime.agent_runtime.agent_runtime_id}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn

  tags = {
    Name        = "${var.name_prefix}-agent-logs-${var.environment}"
    Environment = var.environment
    Project     = var.name_prefix
    Purpose     = "Agent runtime application logs"
    Module      = "Observability"
  }

  depends_on = [aws_bedrockagentcore_agent_runtime.agent_runtime]
}

# Delivery Source for Application Logs
resource "aws_cloudwatch_log_delivery_source" "logs" {
  name         = "${aws_bedrockagentcore_agent_runtime.agent_runtime.agent_runtime_id}-logs-source"
  log_type     = "APPLICATION_LOGS"
  resource_arn = aws_bedrockagentcore_agent_runtime.agent_runtime.agent_runtime_arn

  depends_on = [aws_bedrockagentcore_agent_runtime.agent_runtime]
}

# Delivery Destination for Logs (CloudWatch Logs)
resource "aws_cloudwatch_log_delivery_destination" "logs" {
  name = "${aws_bedrockagentcore_agent_runtime.agent_runtime.agent_runtime_id}-logs-destination"

  delivery_destination_configuration {
    destination_resource_arn = aws_cloudwatch_log_group.agent_runtime_logs.arn
  }

  tags = {
    Name        = "${var.name_prefix}-logs-destination-${var.environment}"
    Environment = var.environment
    Project     = var.name_prefix
    Purpose     = "CloudWatch Logs delivery destination"
    Module      = "Observability"
  }

  depends_on = [aws_cloudwatch_log_group.agent_runtime_logs]
}

# Delivery Connection for Logs
resource "aws_cloudwatch_log_delivery" "logs" {
  delivery_source_name     = aws_cloudwatch_log_delivery_source.logs.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.logs.arn

  tags = {
    Name        = "${var.name_prefix}-logs-delivery-${var.environment}"
    Environment = var.environment
    Project     = var.name_prefix
    Purpose     = "Connect logs source to CloudWatch destination"
    Module      = "Observability"
  }

  depends_on = [
    aws_cloudwatch_log_delivery_source.logs,
    aws_cloudwatch_log_delivery_destination.logs
  ]
}

# ============================================================================
# X-Ray Traces Setup
# ============================================================================

# Delivery Source for Traces
resource "aws_cloudwatch_log_delivery_source" "traces" {
  name         = "${aws_bedrockagentcore_agent_runtime.agent_runtime.agent_runtime_id}-traces-source"
  log_type     = "TRACES"
  resource_arn = aws_bedrockagentcore_agent_runtime.agent_runtime.agent_runtime_arn

  depends_on = [aws_bedrockagentcore_agent_runtime.agent_runtime]
}

# Delivery Destination for Traces (X-Ray)
resource "aws_cloudwatch_log_delivery_destination" "traces" {
  name                      = "${aws_bedrockagentcore_agent_runtime.agent_runtime.agent_runtime_id}-traces-destination"
  delivery_destination_type = "XRAY"

  tags = {
    Name        = "${var.name_prefix}-traces-destination-${var.environment}"
    Environment = var.environment
    Project     = var.name_prefix
    Purpose     = "X-Ray traces delivery destination"
    Module      = "Observability"
  }
}

# Delivery Connection for Traces
resource "aws_cloudwatch_log_delivery" "traces" {
  delivery_source_name     = aws_cloudwatch_log_delivery_source.traces.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.traces.arn

  tags = {
    Name        = "${var.name_prefix}-traces-delivery-${var.environment}"
    Environment = var.environment
    Project     = var.name_prefix
    Purpose     = "Connect traces source to X-Ray destination"
    Module      = "Observability"
  }

  depends_on = [
    aws_cloudwatch_log_delivery_source.traces,
    aws_cloudwatch_log_delivery_destination.traces
  ]
}

