# API Gateway Module
# Purpose: REST API for Market Surveillance Web Application
# Provides endpoints for:
# - Alert investigation chat (conversations, summaries)
# - Alert data queries (alerts, accounts, products, trades)

locals {
  api_name   = "market-surveillance-api-${var.environment}"
  stage_name = var.stage_name != "" ? var.stage_name : var.environment
}





# IAM Role for API Gateway CloudWatch Logging
resource "aws_iam_role" "api_gateway_cloudwatch" {
  count = var.enable_logging ? 1 : 0
  name  = "api-gateway-cloudwatch-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "apigateway.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "api-gateway-cloudwatch-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Attach managed policy for CloudWatch logging
resource "aws_iam_role_policy_attachment" "api_gateway_cloudwatch" {
  count      = var.enable_logging ? 1 : 0
  role       = aws_iam_role.api_gateway_cloudwatch[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

# Set API Gateway account settings for CloudWatch logging
resource "aws_api_gateway_account" "this" {
  count               = var.enable_logging ? 1 : 0
  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch[0].arn
}

# REST API
resource "aws_api_gateway_rest_api" "this" {
  name        = local.api_name
  description = "Market Surveillance Web Portal API"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = local.api_name
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Request Validator
resource "aws_api_gateway_request_validator" "request_validator" {
  name                        = "market-surveillance-request-validator"
  rest_api_id                 = aws_api_gateway_rest_api.this.id
  validate_request_body       = true
  validate_request_parameters = true
}



# ─────────────────────────────────────────────────────────────────────────────
# Dual-token Lambda authorizer — accepts either an AVA HMAC handoff (users
# coming from the AVA UI's Open-App button) or a Cognito RS256 id_token
# (users who logged in via the app's own /login form). Replaces the previous
# COGNITO_USER_POOLS authorizer.
#
# Behavior matrix:
#   AVA secret set  + Cognito pool set  → both paths accepted (federated deploy)
#   AVA secret set  + Cognito pool empty → AVA-only
#   AVA secret empty + Cognito pool set  → Cognito-only (standalone deploy)
#   Both empty                           → fail-closed (denies everything)
#
# The old `cognito` authorizer resource is kept for reference under the same
# variable-gated `count = var.cognito_user_pool_arn != "" ? 1 : 0` pattern
# but is no longer referenced by any method — the switch below points every
# authorized method at `dual_token.id`.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  # Whether we should create the dual-token authorizer at all. The old
  # cognito_user_pool_arn variable stays as the toggle so existing callers
  # (foundations/main.tf) don't need to change to still get an authorizer.
  enable_authorizer = var.cognito_user_pool_arn != "" || var.fsi_app_signing_secret != ""

  # Extract user-pool ID from ARN: arn:aws:cognito-idp:us-east-1:acct:userpool/<id>
  cognito_pool_id = var.cognito_user_pool_arn != "" ? element(split("/", var.cognito_user_pool_arn), length(split("/", var.cognito_user_pool_arn)) - 1) : ""

  authorizer_build_dir = "${path.module}/.authorizer-build"
}

# Build the Lambda deployment zip at apply time — vendor python-jose[cryptography]
# next to the handler. Small (~5 MB) so this is quick.
resource "null_resource" "authorizer_build" {
  count = local.enable_authorizer ? 1 : 0

  triggers = {
    handler_hash = filesha256("${path.module}/lambda/ava_sso_authorizer.py")
    reqs_hash    = filesha256("${path.module}/lambda/requirements.txt")
    # Rebuild once per apply — pip is incremental, so re-runs are fast.
    always_rebuild = timestamp()
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -euo pipefail
      BUILD_DIR="${local.authorizer_build_dir}"
      rm -rf "$BUILD_DIR"
      mkdir -p "$BUILD_DIR"
      cp "${path.module}/lambda/ava_sso_authorizer.py" "$BUILD_DIR/ava_sso_authorizer.py"
      python3 -m pip install \
        --quiet \
        --target "$BUILD_DIR" \
        --platform manylinux2014_x86_64 \
        --only-binary=:all: \
        --python-version 3.12 \
        -r "${path.module}/lambda/requirements.txt"
      find "$BUILD_DIR" -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
      find "$BUILD_DIR" -type d -name '*.dist-info' -exec rm -rf {} + 2>/dev/null || true
    EOT
  }
}

data "archive_file" "authorizer_zip" {
  count = local.enable_authorizer ? 1 : 0

  type        = "zip"
  source_dir  = local.authorizer_build_dir
  output_path = "${path.module}/.authorizer-build/authorizer-lambda.zip"
  depends_on  = [null_resource.authorizer_build]
}

resource "aws_iam_role" "authorizer" {
  count = local.enable_authorizer ? 1 : 0

  name = "${var.environment}-market-surveillance-api-authorizer"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "authorizer_logs" {
  count = local.enable_authorizer ? 1 : 0

  role       = aws_iam_role.authorizer[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "authorizer" {
  count = local.enable_authorizer ? 1 : 0

  name              = "/aws/lambda/${var.environment}-market-surveillance-api-authorizer"
  retention_in_days = 14
}

resource "aws_lambda_function" "authorizer" {
  count = local.enable_authorizer ? 1 : 0

  function_name    = "${var.environment}-market-surveillance-api-authorizer"
  filename         = data.archive_file.authorizer_zip[0].output_path
  source_code_hash = data.archive_file.authorizer_zip[0].output_base64sha256
  handler          = "ava_sso_authorizer.handler"
  runtime          = "python3.12"
  role             = aws_iam_role.authorizer[0].arn
  timeout          = 10
  memory_size      = 256

  environment {
    variables = {
      AVA_FSI_APP_SIGNING_SECRET = var.fsi_app_signing_secret
      COGNITO_USER_POOL_ID       = local.cognito_pool_id
      COGNITO_APP_CLIENT_ID      = var.cognito_app_client_id
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.authorizer_logs,
    aws_cloudwatch_log_group.authorizer,
  ]
}

# API Gateway permission to invoke the authorizer Lambda.
resource "aws_lambda_permission" "authorizer_invoke" {
  count = local.enable_authorizer ? 1 : 0

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.authorizer[0].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/authorizers/*"
}

resource "aws_api_gateway_authorizer" "dual_token" {
  count = local.enable_authorizer ? 1 : 0

  name                             = "ava-sso-dual-token-${var.environment}"
  rest_api_id                      = aws_api_gateway_rest_api.this.id
  type                             = "TOKEN"
  identity_source                  = "method.request.header.Authorization"
  authorizer_uri                   = aws_lambda_function.authorizer[0].invoke_arn
  authorizer_credentials           = null
  authorizer_result_ttl_in_seconds = 60
}

# Legacy Cognito authorizer — retained but no longer referenced by any
# method (all methods point at dual_token above). Kept for a release cycle
# in case rollback is needed, then can be removed in a follow-up.
resource "aws_api_gateway_authorizer" "cognito" {
  count = var.cognito_user_pool_arn != "" ? 1 : 0

  name            = "cognito-authorizer-${var.environment}"
  rest_api_id     = aws_api_gateway_rest_api.this.id
  type            = "COGNITO_USER_POOLS"
  provider_arns   = [var.cognito_user_pool_arn]
  identity_source = "method.request.header.Authorization"
}

# ============================================================================
# Conversations API - Alert Investigation Chat History
# ============================================================================

# API Deployment
resource "aws_api_gateway_deployment" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id

  triggers = {
    # Force redeployment when any configuration changes
    redeployment = sha1(jsonencode([
      # Conversations routes
      aws_api_gateway_resource.conversations.id,
      aws_api_gateway_resource.conversations_alert.id,
      aws_api_gateway_resource.conversations_user.id,
      aws_api_gateway_method.conversations_get.id,
      aws_api_gateway_method.conversations_post.id,
      aws_api_gateway_method.conversations_options.id,
      aws_api_gateway_method.conversations_user_options.id,
      aws_api_gateway_integration.conversations_get.id,
      aws_api_gateway_integration.conversations_post.id,
      # Summaries routes
      aws_api_gateway_resource.summaries.id,
      aws_api_gateway_resource.summaries_alert.id,
      aws_api_gateway_resource.summaries_history.id,
      aws_api_gateway_method.summaries_get.id,
      aws_api_gateway_method.summaries_history_get.id,
      aws_api_gateway_method.summaries_post.id,
      aws_api_gateway_method.summaries_options.id,
      aws_api_gateway_method.summaries_alert_options.id,
      aws_api_gateway_method.summaries_history_options.id,
      aws_api_gateway_integration.summaries_get.id,
      aws_api_gateway_integration.summaries_post.id,
      # Investigations routes
      aws_api_gateway_resource.investigations.id,
      aws_api_gateway_resource.investigations_trigger.id,
      aws_api_gateway_method.investigations_trigger_post.id,
      aws_api_gateway_method.investigations_trigger_options.id,
      aws_api_gateway_integration.investigations_trigger_post.id,
      # RDS API routes
      aws_api_gateway_resource.alerts.id,
      aws_api_gateway_resource.alerts_id.id,
      aws_api_gateway_resource.alerts_account.id,
      aws_api_gateway_resource.alerts_product.id,
      aws_api_gateway_resource.alerts_customer_trade.id,
      aws_api_gateway_resource.alerts_related_trades.id,
      aws_api_gateway_method.alerts_get.id,
      aws_api_gateway_method.alerts_id_get.id,
      aws_api_gateway_method.alerts_account_get.id,
      aws_api_gateway_method.alerts_product_get.id,
      aws_api_gateway_method.alerts_customer_trade_get.id,
      aws_api_gateway_method.alerts_related_trades_get.id,
      aws_api_gateway_integration.alerts_get.id,
      aws_api_gateway_integration.alerts_id_get.id,
      aws_api_gateway_integration.alerts_account_get.id,
      aws_api_gateway_integration.alerts_product_get.id,
      aws_api_gateway_integration.alerts_customer_trade_get.id,
      aws_api_gateway_integration.alerts_related_trades_get.id,
      aws_api_gateway_method.alerts_options.id,
      aws_api_gateway_method.alerts_id_options.id,
      aws_api_gateway_method.alerts_account_options.id,
      aws_api_gateway_method.alerts_product_options.id,
      aws_api_gateway_method.alerts_customer_trade_options.id,
      aws_api_gateway_method.alerts_related_trades_options.id,
      aws_api_gateway_integration_response.alerts_options.id,
      aws_api_gateway_integration_response.alerts_id_options.id,
      # Add timestamp to force redeployment
      timestamp()
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_integration.conversations_get,
    aws_api_gateway_integration.conversations_post,
    aws_api_gateway_integration.conversations_options,
    aws_api_gateway_integration.conversations_user_options,
    aws_api_gateway_integration_response.conversations_options,
    aws_api_gateway_integration_response.conversations_user_options,
    aws_api_gateway_integration.summaries_get,
    aws_api_gateway_integration.summaries_history_get,
    aws_api_gateway_integration.summaries_post,
    aws_api_gateway_integration.summaries_options,
    aws_api_gateway_integration.summaries_alert_options,
    aws_api_gateway_integration.summaries_history_options,
    aws_api_gateway_integration_response.summaries_options,
    aws_api_gateway_integration_response.summaries_alert_options,
    aws_api_gateway_integration_response.summaries_history_options,
    # Investigations integrations
    aws_api_gateway_integration.investigations_trigger_post,
    aws_api_gateway_integration.investigations_trigger_options,
    aws_api_gateway_integration_response.investigations_trigger_options,
    # RDS API integrations
    aws_api_gateway_integration.alerts_get,
    aws_api_gateway_integration.alerts_id_get,
    aws_api_gateway_integration.alerts_account_get,
    aws_api_gateway_integration.alerts_product_get,
    aws_api_gateway_integration.alerts_customer_trade_get,
    aws_api_gateway_integration.alerts_related_trades_get,
    aws_api_gateway_integration_response.alerts_options,
    aws_api_gateway_integration_response.alerts_id_options,
    aws_api_gateway_integration_response.alerts_account_options,
    aws_api_gateway_integration_response.alerts_product_options,
    aws_api_gateway_integration_response.alerts_customer_trade_options,
    aws_api_gateway_integration_response.alerts_related_trades_options,
  ]
}

# # Client certificate for API Gateway stage
# resource "aws_api_gateway_client_certificate" "this" {
#   description = "Client certificate for ${local.api_name} stage"

#   tags = {
#     Name        = "${local.api_name}-client-cert"
#     Environment = var.environment
#     Project     = "market-surveillance"
#   }
# }

# API Stage
resource "aws_api_gateway_stage" "this" {
  #checkov:skip=CKV_AWS_73:X-Ray Tracing optional
  #checkov:skip=CKV_AWS_76:Access Logging optional
  deployment_id = aws_api_gateway_deployment.this.id
  rest_api_id   = aws_api_gateway_rest_api.this.id
  stage_name    = local.stage_name
  # client_certificate_id = aws_api_gateway_client_certificate.this.id

  # Enable Caching
  #checkov:skip=CKV_AWS_120:Caching not required for development environment
  cache_cluster_enabled = false

  tags = {
    Name        = "${local.api_name}-${local.stage_name}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Method Settings (Throttling)
resource "aws_api_gateway_method_settings" "this" {
  #checkov:skip=CKV_AWS_276:Data trace is conditionally enabled — enabled in prod environments
  #checkov:skip=CKV_AWS_225:Caching not needed for scope
  rest_api_id = aws_api_gateway_rest_api.this.id
  stage_name  = aws_api_gateway_stage.this.stage_name
  method_path = "*/*"

  settings {
    throttling_rate_limit  = var.throttling_rate_limit
    throttling_burst_limit = var.throttling_burst_limit
    logging_level          = var.enable_logging ? "INFO" : "OFF"
    data_trace_enabled     = var.enable_logging
    metrics_enabled        = true
  }

  # Account-level CloudWatch role must be set before enabling logging on the stage
  depends_on = [aws_api_gateway_account.this]
}

# CloudWatch Log Group for API Gateway
resource "aws_cloudwatch_log_group" "api_gateway" {
  count = var.enable_logging ? 1 : 0

  name              = "/aws/api-gateway/${local.api_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn

  tags = {
    Name        = "${local.api_name}-logs"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# ============================================================================
# Alert API Routes - /conversations and /summaries
# ============================================================================

# /conversations Resource
resource "aws_api_gateway_resource" "conversations" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "conversations"

}

# /conversations/{alertId} Resource
resource "aws_api_gateway_resource" "conversations_alert" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.conversations.id
  path_part   = "{alertId}"
}

# /conversations/{alertId}/{userId} Resource
resource "aws_api_gateway_resource" "conversations_user" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.conversations_alert.id
  path_part   = "{userId}"
}

# GET /conversations/{alertId}/{userId} Method
resource "aws_api_gateway_method" "conversations_get" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.conversations_user.id
  http_method          = "GET"
  authorization        = local.enable_authorizer ? "CUSTOM" : "NONE"
  authorizer_id        = local.enable_authorizer ? aws_api_gateway_authorizer.dual_token[0].id : null
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

# GET /conversations/{alertId}/{userId} Integration
resource "aws_api_gateway_integration" "conversations_get" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.conversations_user.id
  http_method             = aws_api_gateway_method.conversations_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.alert_api_lambda_invoke_arn
}

# POST /conversations Method
resource "aws_api_gateway_method" "conversations_post" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.conversations.id
  http_method          = "POST"
  authorization        = local.enable_authorizer ? "CUSTOM" : "NONE"
  authorizer_id        = local.enable_authorizer ? aws_api_gateway_authorizer.dual_token[0].id : null
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

# POST /conversations Integration
resource "aws_api_gateway_integration" "conversations_post" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.conversations.id
  http_method             = aws_api_gateway_method.conversations_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.alert_api_lambda_invoke_arn
}

# /summaries Resource
resource "aws_api_gateway_resource" "summaries" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "summaries"
}

# /summaries/{alertId} Resource
resource "aws_api_gateway_resource" "summaries_alert" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.summaries.id
  path_part   = "{alertId}"
}

# /summaries/{alertId}/history Resource
resource "aws_api_gateway_resource" "summaries_history" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.summaries_alert.id
  path_part   = "history"
}

# GET /summaries/{alertId} Method
resource "aws_api_gateway_method" "summaries_get" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.summaries_alert.id
  http_method          = "GET"
  authorization        = local.enable_authorizer ? "CUSTOM" : "NONE"
  authorizer_id        = local.enable_authorizer ? aws_api_gateway_authorizer.dual_token[0].id : null
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

# GET /summaries/{alertId} Integration
resource "aws_api_gateway_integration" "summaries_get" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.summaries_alert.id
  http_method             = aws_api_gateway_method.summaries_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.alert_api_lambda_invoke_arn
}

# GET /summaries/{alertId}/history Method
resource "aws_api_gateway_method" "summaries_history_get" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.summaries_history.id
  http_method          = "GET"
  authorization        = local.enable_authorizer ? "CUSTOM" : "NONE"
  authorizer_id        = local.enable_authorizer ? aws_api_gateway_authorizer.dual_token[0].id : null
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

# GET /summaries/{alertId}/history Integration
resource "aws_api_gateway_integration" "summaries_history_get" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.summaries_history.id
  http_method             = aws_api_gateway_method.summaries_history_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.alert_api_lambda_invoke_arn
}

# POST /summaries Method
resource "aws_api_gateway_method" "summaries_post" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.summaries.id
  http_method          = "POST"
  authorization        = local.enable_authorizer ? "CUSTOM" : "NONE"
  authorizer_id        = local.enable_authorizer ? aws_api_gateway_authorizer.dual_token[0].id : null
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

# POST /summaries Integration
resource "aws_api_gateway_integration" "summaries_post" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.summaries.id
  http_method             = aws_api_gateway_method.summaries_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.alert_api_lambda_invoke_arn
}

# ============================================================================
# CORS Configuration for Alert API Routes
# ============================================================================

# OPTIONS /conversations
resource "aws_api_gateway_method" "conversations_options" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.conversations.id
  http_method          = "OPTIONS"
  authorization        = "NONE"
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "conversations_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.conversations.id
  http_method = aws_api_gateway_method.conversations_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "conversations_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.conversations.id
  http_method = aws_api_gateway_method.conversations_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "conversations_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.conversations.id
  http_method = aws_api_gateway_method.conversations_options.http_method
  status_code = aws_api_gateway_method_response.conversations_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# OPTIONS /conversations/{alertId}/{userId}
resource "aws_api_gateway_method" "conversations_user_options" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.conversations_user.id
  http_method          = "OPTIONS"
  authorization        = "NONE"
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "conversations_user_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.conversations_user.id
  http_method = aws_api_gateway_method.conversations_user_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "conversations_user_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.conversations_user.id
  http_method = aws_api_gateway_method.conversations_user_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "conversations_user_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.conversations_user.id
  http_method = aws_api_gateway_method.conversations_user_options.http_method
  status_code = aws_api_gateway_method_response.conversations_user_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# OPTIONS /summaries
resource "aws_api_gateway_method" "summaries_options" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.summaries.id
  http_method          = "OPTIONS"
  authorization        = "NONE"
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "summaries_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.summaries.id
  http_method = aws_api_gateway_method.summaries_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "summaries_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.summaries.id
  http_method = aws_api_gateway_method.summaries_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "summaries_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.summaries.id
  http_method = aws_api_gateway_method.summaries_options.http_method
  status_code = aws_api_gateway_method_response.summaries_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# OPTIONS /summaries/{alertId}
resource "aws_api_gateway_method" "summaries_alert_options" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.summaries_alert.id
  http_method          = "OPTIONS"
  authorization        = "NONE"
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "summaries_alert_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.summaries_alert.id
  http_method = aws_api_gateway_method.summaries_alert_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "summaries_alert_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.summaries_alert.id
  http_method = aws_api_gateway_method.summaries_alert_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "summaries_alert_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.summaries_alert.id
  http_method = aws_api_gateway_method.summaries_alert_options.http_method
  status_code = aws_api_gateway_method_response.summaries_alert_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# OPTIONS /summaries/{alertId}/history
resource "aws_api_gateway_method" "summaries_history_options" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.summaries_history.id
  http_method          = "OPTIONS"
  authorization        = "NONE"
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "summaries_history_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.summaries_history.id
  http_method = aws_api_gateway_method.summaries_history_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "summaries_history_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.summaries_history.id
  http_method = aws_api_gateway_method.summaries_history_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "summaries_history_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.summaries_history.id
  http_method = aws_api_gateway_method.summaries_history_options.http_method
  status_code = aws_api_gateway_method_response.summaries_history_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.summaries_history_options]
}



# ============================================================================
# Investigations API - Async Alert Investigation Trigger
# ============================================================================

# /investigations Resource
resource "aws_api_gateway_resource" "investigations" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "investigations"
}

# /investigations/trigger Resource
resource "aws_api_gateway_resource" "investigations_trigger" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.investigations.id
  path_part   = "trigger"
}

# POST /investigations/trigger Method
resource "aws_api_gateway_method" "investigations_trigger_post" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.investigations_trigger.id
  http_method   = "POST"
  authorization = local.enable_authorizer ? "CUSTOM" : "NONE"
  authorizer_id = local.enable_authorizer ? aws_api_gateway_authorizer.dual_token[0].id : null
}

# POST /investigations/trigger Integration (uses alert_api Lambda)
resource "aws_api_gateway_integration" "investigations_trigger_post" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.investigations_trigger.id
  http_method             = aws_api_gateway_method.investigations_trigger_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.alert_api_lambda_invoke_arn
}

# OPTIONS /investigations/trigger (CORS)
resource "aws_api_gateway_method" "investigations_trigger_options" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.investigations_trigger.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "investigations_trigger_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.investigations_trigger.id
  http_method = aws_api_gateway_method.investigations_trigger_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "investigations_trigger_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.investigations_trigger.id
  http_method = aws_api_gateway_method.investigations_trigger_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "investigations_trigger_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.investigations_trigger.id
  http_method = aws_api_gateway_method.investigations_trigger_options.http_method
  status_code = aws_api_gateway_method_response.investigations_trigger_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# ============================================================================
# RDS API Routes - /alerts endpoints
# ============================================================================

# /alerts Resource
resource "aws_api_gateway_resource" "alerts" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "alerts"
}

# /alerts/{alertId} Resource
resource "aws_api_gateway_resource" "alerts_id" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.alerts.id
  path_part   = "{alertId}"
}

# /alerts/{alertId}/account Resource
resource "aws_api_gateway_resource" "alerts_account" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.alerts_id.id
  path_part   = "account"
}

# /alerts/{alertId}/product Resource
resource "aws_api_gateway_resource" "alerts_product" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.alerts_id.id
  path_part   = "product"
}

# /alerts/{alertId}/customer-trade Resource
resource "aws_api_gateway_resource" "alerts_customer_trade" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.alerts_id.id
  path_part   = "customer-trade"
}

# /alerts/{alertId}/related-trades Resource
resource "aws_api_gateway_resource" "alerts_related_trades" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.alerts_id.id
  path_part   = "related-trades"
}

# ============================================================================
# RDS API - GET Methods
# ============================================================================

# GET /alerts
resource "aws_api_gateway_method" "alerts_get" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.alerts.id
  http_method          = "GET"
  authorization        = local.enable_authorizer ? "CUSTOM" : "NONE"
  authorizer_id        = local.enable_authorizer ? aws_api_gateway_authorizer.dual_token[0].id : null
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "alerts_get" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.alerts.id
  http_method             = aws_api_gateway_method.alerts_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.data_api_lambda_invoke_arn
}

# GET /alerts/{alertId}
resource "aws_api_gateway_method" "alerts_id_get" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.alerts_id.id
  http_method          = "GET"
  authorization        = local.enable_authorizer ? "CUSTOM" : "NONE"
  authorizer_id        = local.enable_authorizer ? aws_api_gateway_authorizer.dual_token[0].id : null
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "alerts_id_get" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.alerts_id.id
  http_method             = aws_api_gateway_method.alerts_id_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.data_api_lambda_invoke_arn
}

# GET /alerts/{alertId}/account
resource "aws_api_gateway_method" "alerts_account_get" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.alerts_account.id
  http_method          = "GET"
  authorization        = local.enable_authorizer ? "CUSTOM" : "NONE"
  authorizer_id        = local.enable_authorizer ? aws_api_gateway_authorizer.dual_token[0].id : null
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "alerts_account_get" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.alerts_account.id
  http_method             = aws_api_gateway_method.alerts_account_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.data_api_lambda_invoke_arn
}

# GET /alerts/{alertId}/product
resource "aws_api_gateway_method" "alerts_product_get" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.alerts_product.id
  http_method          = "GET"
  authorization        = local.enable_authorizer ? "CUSTOM" : "NONE"
  authorizer_id        = local.enable_authorizer ? aws_api_gateway_authorizer.dual_token[0].id : null
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "alerts_product_get" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.alerts_product.id
  http_method             = aws_api_gateway_method.alerts_product_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.data_api_lambda_invoke_arn
}

# GET /alerts/{alertId}/customer-trade
resource "aws_api_gateway_method" "alerts_customer_trade_get" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.alerts_customer_trade.id
  http_method          = "GET"
  authorization        = local.enable_authorizer ? "CUSTOM" : "NONE"
  authorizer_id        = local.enable_authorizer ? aws_api_gateway_authorizer.dual_token[0].id : null
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "alerts_customer_trade_get" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.alerts_customer_trade.id
  http_method             = aws_api_gateway_method.alerts_customer_trade_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.data_api_lambda_invoke_arn
}

# GET /alerts/{alertId}/related-trades
resource "aws_api_gateway_method" "alerts_related_trades_get" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.alerts_related_trades.id
  http_method          = "GET"
  authorization        = local.enable_authorizer ? "CUSTOM" : "NONE"
  authorizer_id        = local.enable_authorizer ? aws_api_gateway_authorizer.dual_token[0].id : null
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "alerts_related_trades_get" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.alerts_related_trades.id
  http_method             = aws_api_gateway_method.alerts_related_trades_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.data_api_lambda_invoke_arn
}

# ============================================================================
# RDS API - CORS (OPTIONS Methods)
# ============================================================================

# OPTIONS /alerts
resource "aws_api_gateway_method" "alerts_options" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.alerts.id
  http_method          = "OPTIONS"
  authorization        = "NONE"
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "alerts_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts.id
  http_method = aws_api_gateway_method.alerts_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "alerts_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts.id
  http_method = aws_api_gateway_method.alerts_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "alerts_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts.id
  http_method = aws_api_gateway_method.alerts_options.http_method
  status_code = aws_api_gateway_method_response.alerts_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.alerts_options]
}

# OPTIONS /alerts/{alertId}
resource "aws_api_gateway_method" "alerts_id_options" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.alerts_id.id
  http_method          = "OPTIONS"
  authorization        = "NONE"
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "alerts_id_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts_id.id
  http_method = aws_api_gateway_method.alerts_id_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "alerts_id_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts_id.id
  http_method = aws_api_gateway_method.alerts_id_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "alerts_id_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts_id.id
  http_method = aws_api_gateway_method.alerts_id_options.http_method
  status_code = aws_api_gateway_method_response.alerts_id_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.alerts_id_options]
}

# OPTIONS /alerts/{alertId}/account
resource "aws_api_gateway_method" "alerts_account_options" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.alerts_account.id
  http_method          = "OPTIONS"
  authorization        = "NONE"
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "alerts_account_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts_account.id
  http_method = aws_api_gateway_method.alerts_account_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "alerts_account_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts_account.id
  http_method = aws_api_gateway_method.alerts_account_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "alerts_account_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts_account.id
  http_method = aws_api_gateway_method.alerts_account_options.http_method
  status_code = aws_api_gateway_method_response.alerts_account_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.alerts_account_options]
}

# OPTIONS /alerts/{alertId}/product
resource "aws_api_gateway_method" "alerts_product_options" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.alerts_product.id
  http_method          = "OPTIONS"
  authorization        = "NONE"
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "alerts_product_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts_product.id
  http_method = aws_api_gateway_method.alerts_product_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "alerts_product_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts_product.id
  http_method = aws_api_gateway_method.alerts_product_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "alerts_product_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts_product.id
  http_method = aws_api_gateway_method.alerts_product_options.http_method
  status_code = aws_api_gateway_method_response.alerts_product_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.alerts_product_options]
}

# OPTIONS /alerts/{alertId}/customer-trade
resource "aws_api_gateway_method" "alerts_customer_trade_options" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.alerts_customer_trade.id
  http_method          = "OPTIONS"
  authorization        = "NONE"
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "alerts_customer_trade_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts_customer_trade.id
  http_method = aws_api_gateway_method.alerts_customer_trade_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "alerts_customer_trade_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts_customer_trade.id
  http_method = aws_api_gateway_method.alerts_customer_trade_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "alerts_customer_trade_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts_customer_trade.id
  http_method = aws_api_gateway_method.alerts_customer_trade_options.http_method
  status_code = aws_api_gateway_method_response.alerts_customer_trade_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.alerts_customer_trade_options]
}

# OPTIONS /alerts/{alertId}/related-trades
resource "aws_api_gateway_method" "alerts_related_trades_options" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.alerts_related_trades.id
  http_method          = "OPTIONS"
  authorization        = "NONE"
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "alerts_related_trades_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts_related_trades.id
  http_method = aws_api_gateway_method.alerts_related_trades_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "alerts_related_trades_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts_related_trades.id
  http_method = aws_api_gateway_method.alerts_related_trades_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "alerts_related_trades_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.alerts_related_trades.id
  http_method = aws_api_gateway_method.alerts_related_trades_options.http_method
  status_code = aws_api_gateway_method_response.alerts_related_trades_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.alerts_related_trades_options]
}

