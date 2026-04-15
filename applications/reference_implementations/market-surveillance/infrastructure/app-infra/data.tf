# =============================================================================
# Foundations outputs — read from SSM Parameter Store
# =============================================================================

# --- KMS ---
data "aws_ssm_parameter" "kms_ecr_key_arn" {
  name = "/market-surveillance/${var.environment}/foundations/kms/ecr-key-arn"
}

data "aws_ssm_parameter" "kms_s3_key_arn" {
  name = "/market-surveillance/${var.environment}/foundations/kms/s3-key-arn"
}

data "aws_ssm_parameter" "kms_lambda_key_arn" {
  name = "/market-surveillance/${var.environment}/foundations/kms/lambda-key-arn"
}

data "aws_ssm_parameter" "kms_dynamodb_key_arn" {
  name = "/market-surveillance/${var.environment}/foundations/kms/dynamodb-key-arn"
}

data "aws_ssm_parameter" "kms_logs_key_arn" {
  name = "/market-surveillance/${var.environment}/foundations/kms/logs-key-arn"
}

data "aws_ssm_parameter" "kms_secrets_key_arn" {
  name = "/market-surveillance/${var.environment}/foundations/kms/secrets-key-arn"
}

# --- Cognito ---
data "aws_ssm_parameter" "cognito_user_pool_id" {
  name = "/market-surveillance/${var.environment}/foundations/cognito/user-pool-id"
}

data "aws_ssm_parameter" "cognito_user_pool_arn" {
  name = "/market-surveillance/${var.environment}/foundations/cognito/user-pool-arn"
}

data "aws_ssm_parameter" "cognito_user_pool_client_id" {
  name = "/market-surveillance/${var.environment}/foundations/cognito/user-pool-client-id"
}

data "aws_ssm_parameter" "cognito_user_pool_client_secret" {
  name            = "/market-surveillance/${var.environment}/foundations/cognito/user-pool-client-secret"
  with_decryption = true
}

data "aws_ssm_parameter" "cognito_web_app_client_id" {
  name = "/market-surveillance/${var.environment}/foundations/cognito/web-app-client-id"
}

data "aws_ssm_parameter" "cognito_hosted_ui_url" {
  name = "/market-surveillance/${var.environment}/foundations/cognito/hosted-ui-url"
}

# --- CloudFront ---
data "aws_ssm_parameter" "cloudfront_domain" {
  name = "/market-surveillance/${var.environment}/foundations/cloudfront/domain"
}

# --- RDS ---
data "aws_ssm_parameter" "rds_db_address" {
  name = "/market-surveillance/${var.environment}/foundations/rds/db-address"
}

data "aws_ssm_parameter" "rds_db_port" {
  name = "/market-surveillance/${var.environment}/foundations/rds/db-port"
}

data "aws_ssm_parameter" "rds_db_name" {
  name = "/market-surveillance/${var.environment}/foundations/rds/db-name"
}

data "aws_ssm_parameter" "rds_db_secret_arn" {
  name = "/market-surveillance/${var.environment}/foundations/rds/db-secret-arn"
}

data "aws_ssm_parameter" "rds_db_secret_name" {
  name = "/market-surveillance/${var.environment}/foundations/rds/db-secret-name"
}

# --- Risk Analyst RDS ---
data "aws_ssm_parameter" "msp_rds_db_address" {
  name = "/market-surveillance/${var.environment}/foundations/msp-rds/db-address"
}

data "aws_ssm_parameter" "msp_rds_db_port" {
  name = "/market-surveillance/${var.environment}/foundations/msp-rds/db-port"
}

data "aws_ssm_parameter" "msp_rds_db_name" {
  name = "/market-surveillance/${var.environment}/foundations/msp-rds/db-name"
}

data "aws_ssm_parameter" "msp_rds_db_username" {
  name = "/market-surveillance/${var.environment}/foundations/msp-rds/db-username"
}

data "aws_ssm_parameter" "msp_rds_db_secret_arn" {
  name = "/market-surveillance/${var.environment}/foundations/msp-rds/db-secret-arn"
}

data "aws_ssm_parameter" "msp_rds_db_secret_name" {
  name = "/market-surveillance/${var.environment}/foundations/msp-rds/db-secret-name"
}

# --- DynamoDB ---
data "aws_ssm_parameter" "alert_conversations_table_arn" {
  name = "/market-surveillance/${var.environment}/foundations/dynamodb/alert-conversations-table-arn"
}

data "aws_ssm_parameter" "alert_summaries_table_arn" {
  name = "/market-surveillance/${var.environment}/foundations/dynamodb/alert-summaries-table-arn"
}

data "aws_ssm_parameter" "alert_conversations_table_name" {
  name = "/market-surveillance/${var.environment}/foundations/dynamodb/alert-conversations-table-name"
}

data "aws_ssm_parameter" "alert_summaries_table_name" {
  name = "/market-surveillance/${var.environment}/foundations/dynamodb/alert-summaries-table-name"
}

data "aws_ssm_parameter" "msp_conversations_table_arn" {
  name = "/market-surveillance/${var.environment}/foundations/dynamodb/msp-conversations-table-arn"
}

data "aws_ssm_parameter" "msp_conversations_table_name" {
  name = "/market-surveillance/${var.environment}/foundations/dynamodb/msp-conversations-table-name"
}

# --- Networking ---
data "aws_ssm_parameter" "vpc_id" {
  name = "/market-surveillance/${var.environment}/foundations/networking/vpc-id"
}

data "aws_ssm_parameter" "private_subnet_ids" {
  name = "/market-surveillance/${var.environment}/foundations/networking/private-subnet-ids"
}

# --- ALB ---
data "aws_ssm_parameter" "alb_target_group_arn" {
  name = "/market-surveillance/${var.environment}/foundations/alb/target-group-arn"
}

# --- Security Groups ---
data "aws_ssm_parameter" "lambda_sg_id" {
  name = "/market-surveillance/${var.environment}/foundations/security-groups/lambda-sg-id"
}

data "aws_ssm_parameter" "agentcore_sg_id" {
  name = "/market-surveillance/${var.environment}/foundations/security-groups/agentcore-sg-id"
}

data "aws_ssm_parameter" "webapp_ec2_sg_id" {
  name = "/market-surveillance/${var.environment}/foundations/security-groups/webapp-ec2-sg-id"
}

# =============================================================================
# Reconstruct local.f — identical keys to the former terraform_remote_state
# =============================================================================
locals {
  f = {
    # KMS
    kms_ecr_key_arn      = data.aws_ssm_parameter.kms_ecr_key_arn.value
    kms_s3_key_arn       = data.aws_ssm_parameter.kms_s3_key_arn.value
    kms_lambda_key_arn   = data.aws_ssm_parameter.kms_lambda_key_arn.value
    kms_dynamodb_key_arn = data.aws_ssm_parameter.kms_dynamodb_key_arn.value
    kms_logs_key_arn     = data.aws_ssm_parameter.kms_logs_key_arn.value
    kms_secrets_key_arn  = data.aws_ssm_parameter.kms_secrets_key_arn.value

    # Cognito
    cognito_user_pool_id            = data.aws_ssm_parameter.cognito_user_pool_id.value
    cognito_user_pool_arn           = data.aws_ssm_parameter.cognito_user_pool_arn.value
    cognito_user_pool_client_id     = data.aws_ssm_parameter.cognito_user_pool_client_id.value
    cognito_user_pool_client_secret = data.aws_ssm_parameter.cognito_user_pool_client_secret.value
    cognito_web_app_client_id       = data.aws_ssm_parameter.cognito_web_app_client_id.value
    cognito_hosted_ui_url           = data.aws_ssm_parameter.cognito_hosted_ui_url.value

    # RDS
    rds_db_address     = data.aws_ssm_parameter.rds_db_address.value
    rds_db_port        = data.aws_ssm_parameter.rds_db_port.value
    rds_db_name        = data.aws_ssm_parameter.rds_db_name.value
    rds_db_secret_arn  = data.aws_ssm_parameter.rds_db_secret_arn.value
    rds_db_secret_name = data.aws_ssm_parameter.rds_db_secret_name.value

    # Risk Analyst RDS
    msp_rds_db_address     = data.aws_ssm_parameter.msp_rds_db_address.value
    msp_rds_db_port        = data.aws_ssm_parameter.msp_rds_db_port.value
    msp_rds_db_name        = data.aws_ssm_parameter.msp_rds_db_name.value
    msp_rds_db_username    = data.aws_ssm_parameter.msp_rds_db_username.value
    msp_rds_db_secret_arn  = data.aws_ssm_parameter.msp_rds_db_secret_arn.value
    msp_rds_db_secret_name = data.aws_ssm_parameter.msp_rds_db_secret_name.value

    # DynamoDB
    alert_conversations_table_arn  = data.aws_ssm_parameter.alert_conversations_table_arn.value
    alert_summaries_table_arn      = data.aws_ssm_parameter.alert_summaries_table_arn.value
    alert_conversations_table_name = data.aws_ssm_parameter.alert_conversations_table_name.value
    alert_summaries_table_name     = data.aws_ssm_parameter.alert_summaries_table_name.value
    msp_conversations_table_arn    = data.aws_ssm_parameter.msp_conversations_table_arn.value
    msp_conversations_table_name   = data.aws_ssm_parameter.msp_conversations_table_name.value

    # Networking (nonsensitive — these are infrastructure IDs, not secrets)
    vpc_id             = nonsensitive(data.aws_ssm_parameter.vpc_id.value)
    private_subnet_ids = split(",", nonsensitive(data.aws_ssm_parameter.private_subnet_ids.value))

    # ALB
    alb_target_group_arn = nonsensitive(data.aws_ssm_parameter.alb_target_group_arn.value)

    # Security Groups (nonsensitive — these are infrastructure IDs, not secrets)
    lambda_security_group_id     = nonsensitive(data.aws_ssm_parameter.lambda_sg_id.value)
    agentcore_security_group_id  = nonsensitive(data.aws_ssm_parameter.agentcore_sg_id.value)
    webapp_ec2_security_group_id = nonsensitive(data.aws_ssm_parameter.webapp_ec2_sg_id.value)
  }
}
