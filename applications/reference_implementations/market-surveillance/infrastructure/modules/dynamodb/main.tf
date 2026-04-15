# DynamoDB Module
# Purpose: Two DynamoDB tables for chat history and session metadata

locals {
  chat_history_table_name     = "market-surveillance-chat-history-${var.environment}"
  session_metadata_table_name = "market-surveillance-session-metadata-${var.environment}"
}

# Chat History Table
# Partition Key: session_id (S)
# Sort Key: timestamp (S)
resource "aws_dynamodb_table" "chat_history" {
  name                        = local.chat_history_table_name
  billing_mode                = var.billing_mode
  hash_key                    = "session_id"
  range_key                   = "timestamp"
  deletion_protection_enabled = var.enable_deletion_protection

  attribute {
    name = "session_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  tags = {
    Name        = local.chat_history_table_name
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Session Metadata Table
# Partition Key: user_id (S)
# Sort Key: session_id (S)
# TTL Attribute: expires_at
resource "aws_dynamodb_table" "session_metadata" {
  name                        = local.session_metadata_table_name
  billing_mode                = var.billing_mode
  hash_key                    = "user_id"
  range_key                   = "session_id"
  deletion_protection_enabled = var.enable_deletion_protection

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "session_id"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  tags = {
    Name        = local.session_metadata_table_name
    Environment = var.environment
    Project     = "market-surveillance"
  }
}
