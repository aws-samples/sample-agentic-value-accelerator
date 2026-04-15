# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Archive the Lambda function code - Alert API
data "archive_file" "alert_api" {
  type        = "zip"
  source_file = "${path.module}/alert_api.py"
  output_path = "${path.module}/alert_api.zip"
}

# Archive the Lambda function code - Risk Analyst API
data "archive_file" "msp_api" {
  type        = "zip"
  source_file = "${path.module}/msp_api.py"
  output_path = "${path.module}/msp_api.zip"
}

# Archive the Lambda function code - Alert MCP
# Simple zip since no external dependencies needed (boto3 is in Lambda runtime)
data "archive_file" "alert_mcp" {
  type        = "zip"
  source_file = "${path.module}/alert_mcp.py"
  output_path = "${path.module}/alert_mcp.zip"
}

# Build Lambda package with dependencies
resource "null_resource" "build_data_api_package" {
  triggers = {
    requirements = filemd5("${path.module}/requirements.txt")
    source_code  = filemd5("${path.module}/data_api.py")
    always_run   = timestamp()
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -e
      echo "Building Lambda package with Docker..."
      rm -rf ${path.module}/data_api_package
      docker run --rm --platform linux/arm64 \
        -v $(pwd)/${path.module}:/var/task \
        -w /var/task \
        amazonlinux:2023 \
        bash -c "yum install -y python3.12 python3.12-pip && pip3.12 install -r requirements.txt -t data_api_package && cp data_api.py data_api_package/"
      echo "Lambda package built successfully"
    EOT
  }
}

# Archive the Lambda function code - Data API
# Uses Docker to build Lambda package with dependencies
data "archive_file" "data_api" {
  type        = "zip"
  source_dir  = "${path.module}/data_api_package"
  output_path = "${path.module}/data_api.zip"

  depends_on = [null_resource.build_data_api_package]
}

# IAM Role for Lambda execution
resource "aws_iam_role" "lambda_execution" {
  name = "market-surveillance-lambda-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "market-surveillance-lambda-role-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# IAM Policy for CloudWatch Logs
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# IAM Policy for VPC access (required when Lambda is in VPC)
resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  count      = var.enable_vpc ? 1 : 0
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# IAM Policy for DynamoDB access (Alert API Lambda)
resource "aws_iam_role_policy" "lambda_dynamodb" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0
  name  = "market-surveillance-lambda-dynamodb-${var.environment}"
  role  = aws_iam_role.lambda_execution.id

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

# IAM Policy for Secrets Manager access (RDS API Lambda)
resource "aws_iam_role_policy" "lambda_secrets" {
  name  = "market-surveillance-lambda-secrets-${var.environment}"
  role  = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = var.db_secret_arn
      }
    ]
  })
}

# IAM Policy for AgentCore Runtime invocation (Investigation Trigger Lambda)
resource "aws_iam_role_policy" "lambda_agentcore" {
  name = "market-surveillance-lambda-agentcore-${var.environment}"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:InvokeAgentRuntime"
        ]
        Resource = "arn:aws:bedrock-agentcore:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:runtime/*"
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = "arn:aws:ssm:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:parameter/market-surveillance/${var.environment}/agentcore-runtime-endpoint"
      }
    ]
  })
}

# IAM Policy for KMS decrypt (Lambda environment variable encryption)
resource "aws_iam_role_policy" "lambda_kms" {
  # count = var.kms_key_arn != null ? 1 : 0
  name  = "market-surveillance-lambda-kms-${var.environment}"
  role  = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = var.kms_key_arn
      }
    ]
  })
}

# IAM Policy for DynamoDB KMS decrypt (customer-managed table encryption)
resource "aws_iam_role_policy" "lambda_dynamodb_kms" {
  # count = var.dynamodb_kms_key_arn != null ? 1 : 0
  name  = "market-surveillance-lambda-dynamodb-kms-${var.environment}"
  role  = aws_iam_role.lambda_execution.id

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

# IAM Policy for S3 Risk Analyst Plots access
resource "aws_iam_role_policy" "lambda_s3_msp_plots" {
  count = 1 #var.s3_msp_plots_bucket_arn != "" ? 1 : 0
  name  = "market-surveillance-lambda-s3-msp-plots-${var.environment}"
  role  = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject", "s3:ListBucket"]
      Resource = [var.s3_msp_plots_bucket_arn, "${var.s3_msp_plots_bucket_arn}/*"]
    }]
  })
}

# IAM Policy for S3 KMS key access (separate from Lambda env var KMS key)
resource "aws_iam_role_policy" "lambda_s3_kms" {
  count = var.s3_kms_key_arn != null ? 1 : 0
  name  = "market-surveillance-lambda-s3-kms-${var.environment}"
  role  = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
      Resource = var.s3_kms_key_arn
    }]
  })
}

# Lambda Function - Alert API
resource "aws_lambda_function" "alert_api" { 
  #checkov:skip=CKV_AWS_50:X-Ray tracing not required — CloudWatch Logs sufficient for observability
  #checkov:skip=CKV_AWS_116:DLQ not applicable — function is synchronously invoked by API Gateway
  #checkov:skip=CKV_AWS_272:Code signing requires CI/CD pipeline changes — planned as separate workstream
  filename         = data.archive_file.alert_api.output_path
  function_name    = "market-surveillance-alert-api-${var.environment}"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "alert_api.handler"
  source_code_hash = data.archive_file.alert_api.output_base64sha256
  runtime                        = "python3.13"
  timeout                        = 300 # 5 minutes - needs time to invoke AgentCore for investigations
  memory_size                    = 1024 # 1GB memory
  publish          = var.enable_provisioned_concurrency # Publish version for provisioned concurrency
  kms_key_arn                    = var.kms_key_arn
  reserved_concurrent_executions = 100

  environment {
    variables = {
      ENVIRONMENT                        = var.environment
      CONVERSATIONS_TABLE                = var.conversations_table_name
      SUMMARIES_TABLE                    = var.summaries_table_name
      AGENTCORE_RUNTIME_ENDPOINT_SSM_KEY = "/market-surveillance/${var.environment}/agentcore-runtime-endpoint"
    }
  }

  # VPC Configuration (optional)
  dynamic "vpc_config" {
    for_each = var.enable_vpc ? [1] : []
    content {
      subnet_ids         = var.vpc_subnet_ids
      security_group_ids = var.vpc_security_group_ids
    }
  }

  tags = {
    Name        = "market-surveillance-alert-api-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Lambda Function - Alert MCP (for AgentCore Gateway)
resource "aws_lambda_function" "alert_mcp" { # nosemgrep: terraform.aws.security.aws-lambda-x-ray-tracing-not-active.aws-lambda-x-ray-tracing-not-active
  #checkov:skip=CKV_AWS_50:X-Ray tracing not required — CloudWatch Logs sufficient for observability
  #checkov:skip=CKV_AWS_116:DLQ not applicable — function is synchronously invoked by AgentCore Gateway
  #checkov:skip=CKV_AWS_272:Code signing requires CI/CD pipeline changes — planned as separate workstream
  filename         = data.archive_file.alert_mcp.output_path
  function_name    = "market-surveillance-alert-mcp-${var.environment}"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "alert_mcp.handler"
  source_code_hash = data.archive_file.alert_mcp.output_base64sha256
  runtime                        = "python3.13"
  timeout                        = 300 # 5 minutes - MCP not bound by API Gateway limits
  memory_size                    = 1024 # 1GB memory
  publish          = var.enable_provisioned_concurrency # Publish version for provisioned concurrency
  kms_key_arn                    = var.kms_key_arn
  reserved_concurrent_executions = 100

  environment {
    variables = {
      ENVIRONMENT     = var.environment
      SUMMARIES_TABLE = var.summaries_table_name
    }
  }

  # VPC Configuration (optional - not needed for DynamoDB access)
  dynamic "vpc_config" {
    for_each = var.enable_vpc ? [1] : []
    content {
      subnet_ids         = var.vpc_subnet_ids
      security_group_ids = var.vpc_security_group_ids
    }
  }

  tags = {
    Name        = "market-surveillance-alert-mcp-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
    Purpose     = "MCP tools for AgentCore Gateway"
  }
}

# Lambda permission for AgentCore Gateway invocation (Alert API)
resource "aws_lambda_permission" "agentcore_gateway" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.alert_api.function_name
  principal     = "bedrock-agentcore.amazonaws.com"
  source_arn    = "arn:aws:bedrock-agentcore:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:gateway/*"
}

# Lambda permission for AgentCore Gateway invocation (Alert MCP)
resource "aws_lambda_permission" "agentcore_gateway_mcp" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.alert_mcp.function_name
  principal     = "bedrock-agentcore.amazonaws.com"
  source_arn    = "arn:aws:bedrock-agentcore:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:gateway/*"
}

# Lambda Function - Data API
resource "aws_lambda_function" "data_api" { # nosemgrep: terraform.aws.security.aws-lambda-x-ray-tracing-not-active.aws-lambda-x-ray-tracing-not-active
  #checkov:skip=CKV_AWS_50:X-Ray tracing not required — CloudWatch Logs sufficient for observability
  #checkov:skip=CKV_AWS_116:DLQ not applicable — function is synchronously invoked by API Gateway
  #checkov:skip=CKV_AWS_272:Code signing requires CI/CD pipeline changes — planned as separate workstream
  filename         = data.archive_file.data_api.output_path
  function_name    = "market-surveillance-data-api-${var.environment}"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "data_api.handler"
  source_code_hash = data.archive_file.data_api.output_base64sha256
  runtime                        = "python3.12"
  timeout                        = 30
  memory_size                    = 1024 # 1GB memory
  architectures                  = ["arm64"]
  publish          = var.enable_provisioned_concurrency # Publish version for provisioned concurrency
  kms_key_arn                    = var.kms_key_arn
  reserved_concurrent_executions = 50

  environment {
    variables = {
      ENVIRONMENT    = var.environment
      DB_SECRET_NAME = var.db_secret_name
    }
  }

  # VPC Configuration (required for RDS access)
  dynamic "vpc_config" {
    for_each = var.enable_vpc ? [1] : []
    content {
      subnet_ids         = var.vpc_subnet_ids
      security_group_ids = var.vpc_security_group_ids
    }
  }

  tags = {
    Name        = "market-surveillance-data-api-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Lambda Function - Risk Analyst API
resource "aws_lambda_function" "msp_api" {
  #checkov:skip=CKV_AWS_50:X-Ray tracing not required
  #checkov:skip=CKV_AWS_116:DLQ not applicable — synchronously invoked by API Gateway
  #checkov:skip=CKV_AWS_272:Code signing planned separately
  filename         = data.archive_file.msp_api.output_path
  function_name    = "market-surveillance-msp-api-${var.environment}"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "msp_api.handler"
  source_code_hash = data.archive_file.msp_api.output_base64sha256
  runtime                        = "python3.13"
  timeout                        = 30
  memory_size                    = 512
  publish          = var.enable_provisioned_concurrency
  kms_key_arn                    = var.kms_key_arn
  reserved_concurrent_executions = 50

  environment {
    variables = {
      ENVIRONMENT             = var.environment
      MSP_CONVERSATIONS_TABLE = var.msp_conversations_table_name
      S3_MSP_PLOTS_BUCKET     = var.s3_msp_plots_bucket_name
    }
  }

  dynamic "vpc_config" {
    for_each = var.enable_vpc ? [1] : []
    content {
      subnet_ids         = var.vpc_subnet_ids
      security_group_ids = var.vpc_security_group_ids
    }
  }

  tags = {
    Name        = "market-surveillance-msp-api-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# ============================================================================
# Provisioned Concurrency - Eliminates Cold Starts
# ============================================================================

# Lambda Alias for Alert API (required for provisioned concurrency)
resource "aws_lambda_alias" "alert_api" {
  count            = var.enable_provisioned_concurrency ? 1 : 0
  name             = "live"
  description      = "Live alias for Alert API Lambda with provisioned concurrency"
  function_name    = aws_lambda_function.alert_api.function_name
  function_version = aws_lambda_function.alert_api.version

  lifecycle {
    ignore_changes = [function_version]
  }
}

# Provisioned Concurrency for Alert API
resource "aws_lambda_provisioned_concurrency_config" "alert_api" {
  count                             = var.enable_provisioned_concurrency ? 1 : 0
  function_name                     = aws_lambda_function.alert_api.function_name
  provisioned_concurrent_executions = var.alert_api_provisioned_concurrency
  qualifier                         = aws_lambda_alias.alert_api[0].name

  depends_on = [aws_lambda_alias.alert_api]
}

# Lambda Alias for Alert MCP (required for provisioned concurrency)
resource "aws_lambda_alias" "alert_mcp" {
  count            = var.enable_provisioned_concurrency ? 1 : 0
  name             = "live"
  description      = "Live alias for Alert MCP Lambda with provisioned concurrency"
  function_name    = aws_lambda_function.alert_mcp.function_name
  function_version = aws_lambda_function.alert_mcp.version

  lifecycle {
    ignore_changes = [function_version]
  }
}

# Provisioned Concurrency for Alert MCP
resource "aws_lambda_provisioned_concurrency_config" "alert_mcp" {
  count                             = var.enable_provisioned_concurrency ? 1 : 0
  function_name                     = aws_lambda_function.alert_mcp.function_name
  provisioned_concurrent_executions = var.alert_mcp_provisioned_concurrency
  qualifier                         = aws_lambda_alias.alert_mcp[0].name

  depends_on = [aws_lambda_alias.alert_mcp]
}

# Lambda Alias for Data API (required for provisioned concurrency)
resource "aws_lambda_alias" "data_api" {
  count            = var.enable_provisioned_concurrency ? 1 : 0
  name             = "live"
  description      = "Live alias for Data API Lambda with provisioned concurrency"
  function_name    = aws_lambda_function.data_api.function_name
  function_version = aws_lambda_function.data_api.version

  lifecycle {
    ignore_changes = [function_version]
  }
}

# Provisioned Concurrency for Data API
resource "aws_lambda_provisioned_concurrency_config" "data_api" {
  count                             = var.enable_provisioned_concurrency ? 1 : 0
  function_name                     = aws_lambda_function.data_api.function_name
  provisioned_concurrent_executions = var.data_api_provisioned_concurrency
  qualifier                         = aws_lambda_alias.data_api[0].name

  depends_on = [aws_lambda_alias.data_api]
}
