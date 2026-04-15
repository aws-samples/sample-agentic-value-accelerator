provider "aws" {
  region = var.aws_region
}

# Memory module for AgentCore
module "memory" {
  source = "../modules/agentcore-memory"

  environment = var.environment
  memory_name = "market-surveillance-memory"
  description = "Conversation memory for Market Surveillance Agent with semantic understanding"

  # Event expiry: 7 days minimum (short-term memory)
  event_expiry_duration = 7

  # Long-term memory strategies
  enable_semantic_memory  = true # Extract and persist facts about trades, alerts, investigations
  enable_user_preferences = true # User preferences (optional)
  enable_summarization    = true # Conversation summaries (optional)
}

# ECR module for agent-backend container image
module "ecr" {
  source = "../modules/ecr"

  environment     = var.environment
  repository_name = "agent-backend"
  image_tag       = var.agentcore_image_tag
  dockerfile_path = "${path.root}/../../agent-backend"
  dockerfile_hash = filemd5("${path.root}/../../agent-backend/Dockerfile")
  # Hash all source files and configs to trigger rebuild on any change
  source_code_hash = md5(join("", [
    # Hash Python files in root
    filemd5("${path.root}/../../agent-backend/agent.py"),
    filemd5("${path.root}/../../agent-backend/config.py"),
    # Hash the agents directory
    md5(join("", [for f in fileset("${path.root}/../../agent-backend/agents", "**/*.py") : filemd5("${path.root}/../../agent-backend/agents/${f}")])),
    # Hash the configs directory
    md5(join("", [for f in fileset("${path.root}/../../agent-backend/configs", "**/*") : filemd5("${path.root}/../../agent-backend/configs/${f}")])),
    # Hash dependency file (Dockerfile contains all dependencies)
    filemd5("${path.root}/../../agent-backend/Dockerfile"),
  ]))
  image_retention_count = var.ecr_image_retention_count
  scan_on_push          = true
  force_delete          = var.environment != "prod"
  kms_key_arn           = local.f.kms_ecr_key_arn
}

# ECR module for webapp container image
module "ecr_webapp" {
  source = "../modules/ecr"

  environment     = var.environment
  repository_name = "webapp"
  image_tag       = var.webapp_image_tag
  dockerfile_path = "${path.root}/../../trade-alerts-app"
  dockerfile_hash = filemd5("${path.root}/../../trade-alerts-app/Dockerfile")
  # Hash key files to trigger rebuild on changes
  source_code_hash = md5(join("", [
    filemd5("${path.root}/../../trade-alerts-app/package.json"),
    filemd5("${path.root}/../../trade-alerts-app/next.config.ts"),
    filemd5("${path.root}/../../trade-alerts-app/tsconfig.json"),
  ]))
  image_retention_count = var.ecr_image_retention_count
  scan_on_push          = true
  force_delete          = var.environment != "prod"
  kms_key_arn           = local.f.kms_ecr_key_arn

  docker_build_args = {
    NEXT_PUBLIC_AWS_REGION                   = var.aws_region
    NEXT_PUBLIC_COGNITO_USER_POOL_ID         = local.f.cognito_user_pool_id
    NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID  = local.f.cognito_web_app_client_id
    NEXT_PUBLIC_CLOUDFRONT_DOMAIN            = data.aws_ssm_parameter.cloudfront_domain.value
  }
}

# =============================================================================
# Risk Analyst Agent Infrastructure
# =============================================================================

# ECR module for Risk Analyst agent-backend container image
module "ecr_msp" {
  source = "../modules/ecr"

  environment     = var.environment
  repository_name = "risk-agent-backend"
  image_tag       = var.risk_agentcore_image_tag
  dockerfile_path = "${path.root}/../../risk-agent-backend"
  dockerfile_hash = filemd5("${path.root}/../../risk-agent-backend/Dockerfile")
  source_code_hash = md5(join("", [
    filemd5("${path.root}/../../risk-agent-backend/agent.py"),
    filemd5("${path.root}/../../risk-agent-backend/config.py"),
    md5(join("", [for f in fileset("${path.root}/../../risk-agent-backend/agents", "**/*.py") : filemd5("${path.root}/../../risk-agent-backend/agents/${f}")])),
    md5(join("", [for f in fileset("${path.root}/../../risk-agent-backend/configs", "**/*") : filemd5("${path.root}/../../risk-agent-backend/configs/${f}")])),
    filemd5("${path.root}/../../risk-agent-backend/Dockerfile"),
  ]))
  image_retention_count = var.ecr_image_retention_count
  scan_on_push          = true
  force_delete          = var.environment != "prod"
  kms_key_arn           = local.f.kms_ecr_key_arn
}

# Memory module for Risk Analyst AgentCore
module "risk_memory" {
  source = "../modules/agentcore-memory"

  environment = var.environment
  memory_name = "msp-agent-memory"
  description = "Conversation memory for Risk Analyst Agent with semantic understanding"

  event_expiry_duration = 7

  enable_semantic_memory  = true
  enable_user_preferences = false
  enable_summarization    = true
}

# Risk Analyst AgentCore Runtime
module "risk_agentcore" {
  source = "../modules/agentcore-runtime"

  name_prefix        = "msp"
  environment        = var.environment
  container_uri      = module.ecr_msp.image_uri
  subnet_ids         = local.f.private_subnet_ids
  security_group_ids = [local.f.agentcore_security_group_id]
  protocol           = var.risk_agentcore_protocol
  description        = "Risk Analyst AI Agent Runtime"
  ssm_parameter_arns = [module.parameters.gateway_url_parameter_arn]
  s3_config_bucket   = module.s3_agent_configs.bucket_name
  s3_kms_key_arn     = local.f.kms_s3_key_arn
  enable_memory      = true
  memory_id          = module.risk_memory.memory_id

  # Risk Analyst database credentials access
  db_secret_arn       = local.f.msp_rds_db_secret_arn
  secrets_kms_key_arn = local.f.kms_secrets_key_arn

  # Cognito JWT authorization
  cognito_user_pool_discovery_url = "https://cognito-idp.${var.aws_region}.amazonaws.com/${local.f.cognito_user_pool_id}/.well-known/openid-configuration"
  cognito_user_pool_client_id     = local.f.cognito_web_app_client_id

  # Bedrock Guardrail (shared with market surveillance agent)
  guardrail_arn = module.bedrock_guardrail.guardrail_arn

  # Container ARN
  container_arn = module.ecr_msp.repository_arn

  # KMS encryption for CloudWatch Log Group
  kms_key_arn = local.f.kms_logs_key_arn

  environment_variables = {
    DB_HOST           = local.f.msp_rds_db_address
    DB_PORT           = tostring(local.f.msp_rds_db_port)
    DB_NAME           = local.f.msp_rds_db_name
    DB_USERNAME       = local.f.msp_rds_db_username
    DB_SECRET_ARN     = local.f.msp_rds_db_secret_arn
    ENVIRONMENT       = var.environment
    CONFIG_BUCKET     = module.s3_agent_configs.bucket_name
    SCHEMA_CONFIG_KEY = module.s3_agent_configs.msp_schema_config_key
    # Bedrock Guardrail
    GUARDRAIL_ID      = module.bedrock_guardrail.guardrail_id
    GUARDRAIL_VERSION = module.bedrock_guardrail.guardrail_version
    # Force redeployment when Docker image changes
    IMAGE_BUILD_TRIGGER = module.ecr_msp.docker_build_id
  }

  depends_on = [
    module.ecr_msp,
    module.s3_agent_configs,
    module.risk_memory,
    module.bedrock_guardrail
  ]
}

# S3 Agent Configs module
module "s3_agent_configs" {
  source = "../modules/s3-agent-configs"

  environment                        = var.environment
  enable_versioning                  = true
  noncurrent_version_expiration_days = 90
  kms_key_arn                        = local.f.kms_s3_key_arn
}

# S3 Risk Analyst Plots module - stores Risk Analyst agent-generated chart images
module "s3_msp_plots" {
  source      = "../modules/s3-msp-plots"
  environment = var.environment
  kms_key_arn = local.f.kms_s3_key_arn
}

# Lambda module for AgentCore Gateway tools
module "lambda" {
  source = "../modules/lambda"

  environment = var.environment
  dynamodb_table_arns = [
    local.f.alert_conversations_table_arn,
    local.f.alert_summaries_table_arn,
    local.f.msp_conversations_table_arn
  ]
  conversations_table_name     = local.f.alert_conversations_table_name
  summaries_table_name         = local.f.alert_summaries_table_name
  msp_conversations_table_name = local.f.msp_conversations_table_name

  # KMS encryption for Lambda environment variables
  kms_key_arn = local.f.kms_lambda_key_arn

  # KMS key for DynamoDB table encryption (decrypt/encrypt access)
  dynamodb_kms_key_arn = local.f.kms_dynamodb_key_arn

  # S3 Risk Analyst Plots bucket
  s3_msp_plots_bucket_name = module.s3_msp_plots.bucket_name
  s3_msp_plots_bucket_arn  = module.s3_msp_plots.bucket_arn
  s3_kms_key_arn           = local.f.kms_s3_key_arn

  # RDS Configuration
  db_secret_arn  = local.f.rds_db_secret_arn
  db_secret_name = local.f.rds_db_secret_name

  # VPC Configuration - Enable for private networking
  enable_vpc             = var.enable_lambda_vpc
  vpc_subnet_ids         = local.f.private_subnet_ids
  vpc_security_group_ids = [local.f.lambda_security_group_id]
}

# AgentCore Gateway module
module "ac_gateway" {
  source = "../modules/agentcore-gateway"

  environment          = var.environment
  alert_mcp_lambda_arn = module.lambda.alert_mcp_function_arn

  depends_on = [module.lambda]
}

# API Gateway module - Market Surveillance Web Application API
# Provides REST endpoints for:
# - Alert investigation features (chat, conversations, summaries)
# - Alert data queries (alerts, accounts, products, trades)
module "api_gateway" {
  source = "../modules/api-gateway"

  environment                 = var.environment
  throttling_rate_limit       = var.api_throttling_rate_limit
  throttling_burst_limit      = var.api_throttling_burst_limit
  enable_logging              = true
  alert_api_lambda_invoke_arn = module.lambda.alert_api_invoke_arn
  data_api_lambda_invoke_arn  = module.lambda.data_api_invoke_arn
  msp_api_lambda_invoke_arn   = module.lambda.msp_api_invoke_arn
  cognito_user_pool_arn       = local.f.cognito_user_pool_arn
  kms_key_arn                 = local.f.kms_logs_key_arn

  depends_on = [module.lambda]
}

# Lambda permission for API Gateway to invoke Alert API
resource "aws_lambda_permission" "api_gateway_alert_api" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = module.lambda.alert_api_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${module.api_gateway.execution_arn}/*/*"

  depends_on = [module.lambda, module.api_gateway]
}

# Lambda permission for API Gateway to invoke Data API
resource "aws_lambda_permission" "api_gateway_data_api" {
  statement_id  = "AllowAPIGatewayInvokeDataAPI"
  action        = "lambda:InvokeFunction"
  function_name = module.lambda.data_api_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${module.api_gateway.execution_arn}/*/*"

  depends_on = [module.lambda, module.api_gateway]
}

# Lambda permission for API Gateway to invoke Risk Analyst API
resource "aws_lambda_permission" "api_gateway_msp_api" {
  statement_id  = "AllowAPIGatewayInvokeMspAPI"
  action        = "lambda:InvokeFunction"
  function_name = module.lambda.msp_api_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${module.api_gateway.execution_arn}/*/*"

  depends_on = [module.lambda, module.api_gateway]
}

# Parameter Store module for configuration values
module "parameters" {
  source = "../modules/parameters"

  environment                = var.environment
  gateway_url                = module.ac_gateway.gateway_url
  cognito_client_id          = local.f.cognito_user_pool_client_id
  cognito_client_secret      = local.f.cognito_user_pool_client_secret
  cognito_oauth_url          = local.f.cognito_hosted_ui_url
  kms_key_arn                = local.f.kms_secrets_key_arn
  agentcore_runtime_endpoint = module.agentcore.agent_runtime_endpoint

  depends_on = [module.ac_gateway]
}

# AgentCore module
module "agentcore" {
  source = "../modules/agentcore-runtime"

  environment        = var.environment
  container_uri      = module.ecr.image_uri
  subnet_ids         = local.f.private_subnet_ids
  security_group_ids = [local.f.agentcore_security_group_id]
  protocol           = var.agentcore_protocol
  description        = "Market Surveillance AI Agent Runtime"
  ssm_parameter_arns = [module.parameters.gateway_url_parameter_arn]
  s3_config_bucket   = module.s3_agent_configs.bucket_name
  s3_kms_key_arn     = local.f.kms_s3_key_arn
  enable_memory      = true
  memory_id          = module.memory.memory_id

  # DynamoDB table access
  dynamodb_table_arns = [
    local.f.alert_conversations_table_arn,
    local.f.alert_summaries_table_arn
  ]
  dynamodb_kms_key_arn = local.f.kms_dynamodb_key_arn

  # Database credentials access
  db_secret_arn       = local.f.rds_db_secret_arn
  secrets_kms_key_arn = local.f.kms_secrets_key_arn

  # Cognito JWT authorization
  cognito_user_pool_discovery_url = "https://cognito-idp.${var.aws_region}.amazonaws.com/${local.f.cognito_user_pool_id}/.well-known/openid-configuration"
  cognito_user_pool_client_id     = local.f.cognito_web_app_client_id

  # Bedrock Guardrail
  guardrail_arn = module.bedrock_guardrail.guardrail_arn

  # Container ARN
  container_arn = module.ecr.repository_arn

  # KMS encryption for CloudWatch Log Group
  kms_key_arn = local.f.kms_logs_key_arn

  environment_variables = {
    DB_HOST                         = local.f.rds_db_address
    DB_PORT                         = tostring(local.f.rds_db_port)
    DB_NAME                         = local.f.rds_db_name
    DB_USERNAME                     = var.db_username
    DB_SECRET_ARN                   = local.f.rds_db_secret_arn
    ENVIRONMENT                     = var.environment
    SSM_GATEWAY_URL_PARAM           = module.parameters.gateway_url_parameter_name
    CONFIG_BUCKET                   = module.s3_agent_configs.bucket_name
    SCHEMA_CONFIG_KEY               = module.s3_agent_configs.schema_config_key
    ORCHESTRATOR_CONFIG_KEY         = module.s3_agent_configs.orchestrator_config_key
    RULE_DEFINITION_CONFIG_KEY      = module.s3_agent_configs.rule_definition_config_key
    ANALYST_METRICS_CONFIG_KEY      = module.s3_agent_configs.analyst_metrics_config_key
    # DynamoDB table names
    ALERT_CONVERSATIONS_TABLE = local.f.alert_conversations_table_name
    ALERT_SUMMARIES_TABLE     = local.f.alert_summaries_table_name
    # Bedrock Guardrail
    GUARDRAIL_ID      = module.bedrock_guardrail.guardrail_id
    GUARDRAIL_VERSION = module.bedrock_guardrail.guardrail_version
    # Force redeployment when Docker image changes
    IMAGE_BUILD_TRIGGER = module.ecr.docker_build_id
  }

  depends_on = [
    module.ecr,
    module.s3_agent_configs,
    module.memory,
    module.bedrock_guardrail
  ]
}

# EC2 Auto Scaling module for webapp
module "ec2_webapp" {
  source = "../modules/ec2-webapp"

  environment            = var.environment
  vpc_id                 = local.f.vpc_id
  private_subnet_ids     = local.f.private_subnet_ids
  security_group_ids     = [local.f.webapp_ec2_security_group_id]
  target_group_arns      = [local.f.alb_target_group_arn]
  ecr_repository_url     = module.ecr_webapp.repository_url
  image_tag              = var.webapp_image_tag
  instance_type          = var.webapp_instance_type
  min_size               = var.webapp_min_size
  max_size               = var.webapp_max_size
  desired_capacity       = var.webapp_desired_capacity
  container_port         = 3000
  cognito_user_pool_id   = local.f.cognito_user_pool_id
  cognito_client_id      = local.f.cognito_web_app_client_id
  api_endpoint           = module.api_gateway.api_endpoint
  agentcore_endpoint     = module.agentcore.agent_runtime_endpoint
  risk_agentcore_endpoint = module.risk_agentcore.agent_runtime_endpoint
  aws_region             = var.aws_region
  target_cpu_utilization = 70

  # KMS encryption for CloudWatch Log Group
  kms_key_arn = local.f.kms_logs_key_arn

  depends_on = [module.ecr_webapp]
}

# Bedrock Guardrail for Market Surveillance Agent
module "bedrock_guardrail" {
  source = "../modules/bedrock-guardrail"

  environment    = var.environment
  guardrail_name = "market-surveillance"
  description    = "Guardrail for Market Surveillance AI Agent - enforces content safety, PII protection, and topic boundaries"

  # Content filters - HIGH strength for a financial services use case
  content_filter_input_strength  = "HIGH"
  content_filter_output_strength = "HIGH"

  # Denied topics - keep the agent focused on market surveillance
  denied_topics = [
    {
      name       = "investment_advice"
      definition = "Providing specific investment recommendations, financial advice, or guidance on buying, selling, or holding particular securities, assets, or financial instruments."
      examples = [
        "Should I buy this stock?",
        "What's a good investment right now?",
        "Is this a good time to sell my shares?"
      ]
    },
    {
      name       = "personal_financial_planning"
      definition = "Guidance on personal financial planning, retirement planning, tax strategies, or wealth management unrelated to market surveillance."
      examples = [
        "How should I plan for retirement?",
        "What tax deductions can I claim?",
        "Help me create a budget"
      ]
    },
    {
      name       = "system_manipulation"
      definition = "Requests to manipulate surveillance outcomes, suppress alerts, hide trading activity, or circumvent compliance controls."
      examples = [
        "How can I hide this trade from compliance?",
        "Can you mark this alert as false positive without investigation?",
        "Help me avoid triggering surveillance alerts"
      ]
    }
  ]

  # PII protection - block on input, anonymize on output
  pii_entities = [
    { type = "EMAIL", input_action = "BLOCK", output_action = "ANONYMIZE" },
    { type = "PHONE", input_action = "BLOCK", output_action = "ANONYMIZE" },
    { type = "US_SOCIAL_SECURITY_NUMBER", input_action = "BLOCK", output_action = "BLOCK" },
    { type = "CREDIT_DEBIT_CARD_NUMBER", input_action = "BLOCK", output_action = "BLOCK" },
    { type = "US_BANK_ACCOUNT_NUMBER", input_action = "BLOCK", output_action = "BLOCK" },
  ]

  # Profanity filter
  enable_profanity_filter = true

  # Contextual grounding - helps detect hallucinations
  enable_contextual_grounding = true
  grounding_threshold         = 0.7
  relevance_threshold         = 0.7

  # Publish a version for stable reference
  create_version = true

  tags = {
    Service = "market-surveillance"
  }
}

# =============================================================================
# SSM Parameter Store — Publish app-infra outputs for script/cross-layer consumption
# =============================================================================
module "output_params" {
  source      = "../modules/foundations-output-params"
  environment = var.environment
  kms_key_arn = local.f.kms_secrets_key_arn
  layer       = "app-infra"

  string_parameters = {
    "ecr/webapp-repository-url"      = module.ecr_webapp.repository_url
    "ecr/risk-agent-backend-repo-url" = module.ecr_msp.repository_url
    "api-gateway/endpoint"           = module.api_gateway.api_endpoint
    "ec2/webapp-asg-name"            = module.ec2_webapp.autoscaling_group_name
    "agentcore/risk-runtime-endpoint" = module.risk_agentcore.agent_runtime_endpoint
  }
}
