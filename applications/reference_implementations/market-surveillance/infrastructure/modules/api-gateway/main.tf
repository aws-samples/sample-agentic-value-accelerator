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



# Cognito Authorizer
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
      # Risk Analyst Conversations routes
      aws_api_gateway_resource.msp_conversations.id,
      aws_api_gateway_resource.msp_conversations_user.id,
      aws_api_gateway_method.msp_conversations_get.id,
      aws_api_gateway_method.msp_conversations_post.id,
      aws_api_gateway_method.msp_conversations_options.id,
      aws_api_gateway_method.msp_conversations_user_options.id,
      aws_api_gateway_integration.msp_conversations_get.id,
      aws_api_gateway_integration.msp_conversations_post.id,
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
    # Risk Analyst Conversations integrations
    aws_api_gateway_integration.msp_conversations_get,
    aws_api_gateway_integration.msp_conversations_post,
    aws_api_gateway_integration.msp_conversations_options,
    aws_api_gateway_integration.msp_conversations_user_options,
    aws_api_gateway_integration_response.msp_conversations_options,
    aws_api_gateway_integration_response.msp_conversations_user_options,
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
  deployment_id         = aws_api_gateway_deployment.this.id
  rest_api_id           = aws_api_gateway_rest_api.this.id
  stage_name            = local.stage_name
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.conversations_user.id
  http_method   = "GET"
  authorization = var.cognito_user_pool_arn != "" ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id = var.cognito_user_pool_arn != "" ? aws_api_gateway_authorizer.cognito[0].id : null
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.conversations.id
  http_method   = "POST"
  authorization = var.cognito_user_pool_arn != "" ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id = var.cognito_user_pool_arn != "" ? aws_api_gateway_authorizer.cognito[0].id : null
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.summaries_alert.id
  http_method   = "GET"
  authorization = var.cognito_user_pool_arn != "" ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id = var.cognito_user_pool_arn != "" ? aws_api_gateway_authorizer.cognito[0].id : null
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.summaries_history.id
  http_method   = "GET"
  authorization = var.cognito_user_pool_arn != "" ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id = var.cognito_user_pool_arn != "" ? aws_api_gateway_authorizer.cognito[0].id : null
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.summaries.id
  http_method   = "POST"
  authorization = var.cognito_user_pool_arn != "" ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id = var.cognito_user_pool_arn != "" ? aws_api_gateway_authorizer.cognito[0].id : null
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.conversations.id
  http_method   = "OPTIONS"
  authorization = "NONE"
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.conversations_user.id
  http_method   = "OPTIONS"
  authorization = "NONE"
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.summaries.id
  http_method   = "OPTIONS"
  authorization = "NONE"
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.summaries_alert.id
  http_method   = "OPTIONS"
  authorization = "NONE"
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.summaries_history.id
  http_method   = "OPTIONS"
  authorization = "NONE"
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

  depends_on = [ aws_api_gateway_integration.summaries_history_options ]
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
  authorization = var.cognito_user_pool_arn != "" ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id = var.cognito_user_pool_arn != "" ? aws_api_gateway_authorizer.cognito[0].id : null
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.alerts.id
  http_method   = "GET"
  authorization = var.cognito_user_pool_arn != "" ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id = var.cognito_user_pool_arn != "" ? aws_api_gateway_authorizer.cognito[0].id : null
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.alerts_id.id
  http_method   = "GET"
  authorization = var.cognito_user_pool_arn != "" ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id = var.cognito_user_pool_arn != "" ? aws_api_gateway_authorizer.cognito[0].id : null
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.alerts_account.id
  http_method   = "GET"
  authorization = var.cognito_user_pool_arn != "" ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id = var.cognito_user_pool_arn != "" ? aws_api_gateway_authorizer.cognito[0].id : null
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.alerts_product.id
  http_method   = "GET"
  authorization = var.cognito_user_pool_arn != "" ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id = var.cognito_user_pool_arn != "" ? aws_api_gateway_authorizer.cognito[0].id : null
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.alerts_customer_trade.id
  http_method   = "GET"
  authorization = var.cognito_user_pool_arn != "" ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id = var.cognito_user_pool_arn != "" ? aws_api_gateway_authorizer.cognito[0].id : null
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.alerts_related_trades.id
  http_method   = "GET"
  authorization = var.cognito_user_pool_arn != "" ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id = var.cognito_user_pool_arn != "" ? aws_api_gateway_authorizer.cognito[0].id : null
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.alerts.id
  http_method   = "OPTIONS"
  authorization = "NONE"
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.alerts_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.alerts_account.id
  http_method   = "OPTIONS"
  authorization = "NONE"
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.alerts_product.id
  http_method   = "OPTIONS"
  authorization = "NONE"
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.alerts_customer_trade.id
  http_method   = "OPTIONS"
  authorization = "NONE"
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
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.alerts_related_trades.id
  http_method   = "OPTIONS"
  authorization = "NONE"
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

# ============================================================================
# Risk Analyst Conversations API Routes
# ============================================================================

# /msp-conversations Resource
resource "aws_api_gateway_resource" "msp_conversations" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "msp-conversations"
}

# /msp-conversations/{userId} Resource
resource "aws_api_gateway_resource" "msp_conversations_user" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.msp_conversations.id
  path_part   = "{userId}"
}

# GET /msp-conversations/{userId} Method
resource "aws_api_gateway_method" "msp_conversations_get" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.msp_conversations_user.id
  http_method          = "GET"
  authorization        = var.cognito_user_pool_arn != "" ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id        = var.cognito_user_pool_arn != "" ? aws_api_gateway_authorizer.cognito[0].id : null
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

# GET /msp-conversations/{userId} Integration
resource "aws_api_gateway_integration" "msp_conversations_get" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.msp_conversations_user.id
  http_method             = aws_api_gateway_method.msp_conversations_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.msp_api_lambda_invoke_arn
}

# POST /msp-conversations Method
resource "aws_api_gateway_method" "msp_conversations_post" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.msp_conversations.id
  http_method          = "POST"
  authorization        = var.cognito_user_pool_arn != "" ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id        = var.cognito_user_pool_arn != "" ? aws_api_gateway_authorizer.cognito[0].id : null
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

# POST /msp-conversations Integration
resource "aws_api_gateway_integration" "msp_conversations_post" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.msp_conversations.id
  http_method             = aws_api_gateway_method.msp_conversations_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.msp_api_lambda_invoke_arn
}

# ============================================================================
# Risk Analyst Conversations - CORS (OPTIONS Methods)
# ============================================================================

# OPTIONS /msp-conversations
resource "aws_api_gateway_method" "msp_conversations_options" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.msp_conversations.id
  http_method          = "OPTIONS"
  authorization        = "NONE"
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "msp_conversations_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.msp_conversations.id
  http_method = aws_api_gateway_method.msp_conversations_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "msp_conversations_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.msp_conversations.id
  http_method = aws_api_gateway_method.msp_conversations_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "msp_conversations_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.msp_conversations.id
  http_method = aws_api_gateway_method.msp_conversations_options.http_method
  status_code = aws_api_gateway_method_response.msp_conversations_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.msp_conversations_options]
}

# OPTIONS /msp-conversations/{userId}
resource "aws_api_gateway_method" "msp_conversations_user_options" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.msp_conversations_user.id
  http_method          = "OPTIONS"
  authorization        = "NONE"
  request_validator_id = aws_api_gateway_request_validator.request_validator.id
}

resource "aws_api_gateway_integration" "msp_conversations_user_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.msp_conversations_user.id
  http_method = aws_api_gateway_method.msp_conversations_user_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "msp_conversations_user_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.msp_conversations_user.id
  http_method = aws_api_gateway_method.msp_conversations_user_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "msp_conversations_user_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.msp_conversations_user.id
  http_method = aws_api_gateway_method.msp_conversations_user_options.http_method
  status_code = aws_api_gateway_method_response.msp_conversations_user_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.msp_conversations_user_options]
}
