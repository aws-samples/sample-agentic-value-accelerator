# =============================================================================
# Output Parameters — SSM Parameter Store
# Writes infrastructure-layer outputs as SSM parameters for cross-layer consumption
# Naming: /market-surveillance/{env}/{layer}/{category}/{key}
# =============================================================================

# --- String parameters (non-sensitive) ---
resource "aws_ssm_parameter" "string" {
  #checkov:skip=CKV2_AWS_34:Non-sensitive infrastructure identifiers
  for_each = var.string_parameters

  name  = "/market-surveillance/${var.environment}/${var.layer}/${each.key}"
  type  = "String"
  value = each.value

  tags = {
    Name        = each.key
    Environment = var.environment
    Project     = "market-surveillance"
    ManagedBy   = "Terraform"
    Layer       = var.layer
  }
}

# --- SecureString parameters (sensitive, KMS-encrypted) ---
resource "aws_ssm_parameter" "secure_string" {
  for_each = var.secure_string_keys

  name   = "/market-surveillance/${var.environment}/${var.layer}/${each.value}"
  type   = "SecureString"
  value  = var.secure_string_values[each.value]
  key_id = var.kms_key_arn

  tags = {
    Name        = each.value
    Environment = var.environment
    Project     = "market-surveillance"
    ManagedBy   = "Terraform"
    Layer       = var.layer
  }
}

# --- StringList parameters (comma-separated lists) ---
resource "aws_ssm_parameter" "string_list" {
  #checkov:skip=CKV2_AWS_34:Non-sensitive infrastructure identifiers
  for_each = var.string_list_parameters

  name  = "/market-surveillance/${var.environment}/${var.layer}/${each.key}"
  type  = "StringList"
  value = join(",", each.value)

  tags = {
    Name        = each.key
    Environment = var.environment
    Project     = "market-surveillance"
    ManagedBy   = "Terraform"
    Layer       = var.layer
  }
}
