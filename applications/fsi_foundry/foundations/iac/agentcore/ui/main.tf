terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  region_suffix   = replace(var.aws_region, "-", "")
  framework_short_map = {
    "langchain_langgraph" = "lg"
    "strands"             = "st"
  }
  framework_short = lookup(local.framework_short_map, var.framework, var.framework)
  resource_prefix = "${var.project_name}-${var.use_case_id}-${local.framework_short}"
  # Shorter prefix for resources with strict name length limits (IAM 64, S3 63)
  # Note: framework is NOT in short_prefix to avoid destroy/recreate cycles on existing resources
  # S3 bucket uses a separate name with framework for isolation
  short_prefix    = "ava-${replace(var.use_case_name, "_", "-")}-ui"
}

data "aws_caller_identity" "current" {}

# Shared secret between CloudFront and Lambda to restrict direct API Gateway access
resource "random_password" "origin_secret" {
  length  = 48
  special = false
}

# =============================================================================
# DynamoDB table for async session state
# =============================================================================

resource "aws_dynamodb_table" "sessions" {
  name         = "${local.short_prefix}-sessions-${local.region_suffix}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "session_id"

  attribute {
    name = "session_id"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Name        = "${local.resource_prefix}-ui-sessions"
    Environment = var.environment
    UseCaseId   = var.use_case_id
  }
}

# =============================================================================
# Lambda — API handler (start invoke + check status, <1s each)
# =============================================================================

data "archive_file" "lambda_proxy" {
  type        = "zip"
  source_file = "${path.module}/lambda/proxy.py"
  output_path = "${path.module}/lambda_proxy.zip"
}

resource "aws_iam_role" "lambda_role" {
  name = "${local.short_prefix}-proxy-role-${local.region_suffix}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${local.short_prefix}-proxy-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"
      },
      {
        Effect   = "Allow"
        Action   = ["bedrock-agentcore:InvokeAgentRuntime"]
        Resource = "${var.agentcore_runtime_arn}*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
        ]
        Resource = aws_dynamodb_table.sessions.arn
      },
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.short_prefix}-worker-${local.region_suffix}"
      }
    ]
  })
}

resource "aws_lambda_function" "proxy" {
  filename         = data.archive_file.lambda_proxy.output_path
  source_code_hash = data.archive_file.lambda_proxy.output_base64sha256
  function_name    = "${local.short_prefix}-proxy-${local.region_suffix}"
  role             = aws_iam_role.lambda_role.arn
  handler          = "proxy.handler"
  runtime          = "python3.11"
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      AWS_REGION_NAME   = var.aws_region
      ORIGIN_SECRET     = random_password.origin_secret.result
      SESSIONS_TABLE    = aws_dynamodb_table.sessions.name
      WORKER_FUNCTION   = aws_lambda_function.worker.function_name
    }
  }
}

# =============================================================================
# Lambda — Worker (async, invokes AgentCore, stores result in DynamoDB)
# =============================================================================

data "archive_file" "lambda_worker" {
  type        = "zip"
  source_file = "${path.module}/lambda/worker.py"
  output_path = "${path.module}/lambda_worker.zip"
}

resource "aws_iam_role" "worker_role" {
  name = "${local.short_prefix}-worker-role-${local.region_suffix}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "worker_policy" {
  name = "${local.short_prefix}-worker-policy"
  role = aws_iam_role.worker_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"
      },
      {
        Effect   = "Allow"
        Action   = ["bedrock-agentcore:InvokeAgentRuntime"]
        Resource = "${var.agentcore_runtime_arn}*"
      },
      {
        Effect = "Allow"
        Action = ["dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.sessions.arn
      }
    ]
  })
}

resource "aws_lambda_function" "worker" {
  filename         = data.archive_file.lambda_worker.output_path
  source_code_hash = data.archive_file.lambda_worker.output_base64sha256
  function_name    = "${local.short_prefix}-worker-${local.region_suffix}"
  role             = aws_iam_role.worker_role.arn
  handler          = "worker.handler"
  runtime          = "python3.11"
  timeout          = 300
  memory_size      = 256

  environment {
    variables = {
      AGENT_RUNTIME_ARN = var.agentcore_runtime_arn
      AWS_REGION_NAME   = var.aws_region
      SESSIONS_TABLE    = aws_dynamodb_table.sessions.name
    }
  }
}

# =============================================================================
# API Gateway HTTP API
# =============================================================================

resource "aws_apigatewayv2_api" "proxy" {
  name          = "${local.short_prefix}-api-${local.region_suffix}"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.proxy.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.proxy.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "invoke" {
  api_id    = aws_apigatewayv2_api.proxy.id
  route_key = "POST /api/invoke"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "status" {
  api_id    = aws_apigatewayv2_api.proxy.id
  route_key = "GET /api/status/{sessionId}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.proxy.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.proxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.proxy.execution_arn}/*/*"
}

# =============================================================================
# S3 Bucket for UI (private — only CloudFront can read via OAC)
# =============================================================================

resource "aws_s3_bucket" "ui" {
  # Include framework_short in bucket name for multi-framework isolation
  bucket        = "ava-${replace(var.use_case_name, "_", "-")}-${local.framework_short}-ui-${local.region_suffix}-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "ui" {
  bucket = aws_s3_bucket.ui.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "ui" {
  bucket = aws_s3_bucket.ui.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.ui.arn}/*"
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.ui.arn }
      }
    }]
  })
}

# =============================================================================
# CloudFront
# =============================================================================

resource "aws_cloudfront_origin_access_control" "s3_oac" {
  name                              = "${local.short_prefix}-s3-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# SPA rewrite — only for S3 default behavior, not /api/*
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${local.short_prefix}-spa-rw-${local.region_suffix}"
  runtime = "cloudfront-js-2.0"
  publish = true

  code = <<-EOF
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      if (!uri.includes('.')) {
        request.uri = '/index.html';
      }
      return request;
    }
  EOF
}

locals {
  apigw_domain = replace(replace(aws_apigatewayv2_api.proxy.api_endpoint, "https://", ""), "/", "")
}

resource "aws_cloudfront_distribution" "ui" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  # Origin 1: S3 for static UI
  origin {
    domain_name              = aws_s3_bucket.ui.bucket_regional_domain_name
    origin_id                = "s3-ui"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  # Origin 2: API Gateway for agent proxy
  # Custom header restricts access — Lambda validates this secret
  origin {
    domain_name = local.apigw_domain
    origin_id   = "apigw-api"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "x-origin-secret"
      value = random_password.origin_secret.result
    }
  }

  # Default: serve static UI from S3 with SPA rewrite
  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "s3-ui"

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  # /api/*: proxy to API Gateway, no caching
  ordered_cache_behavior {
    path_pattern     = "/api/*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "apigw-api"

    forwarded_values {
      query_string = true
      headers      = ["Content-Type", "Accept", "Origin"]
      cookies { forward = "none" }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name        = "${local.resource_prefix}-ui"
    Environment = var.environment
    UseCaseId   = var.use_case_id
  }
}
