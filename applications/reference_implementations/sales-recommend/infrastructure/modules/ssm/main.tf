###############################################################################
# SSM Module — Parameter Store entries
#
# On first deploy, Terraform creates these with the values passed from the
# AVA deployment form (via buildspec env vars / TF_VAR_*). The lifecycle
# ignore_changes ensures that manual rotations in the console won't get
# reverted on the next terraform apply.
###############################################################################

resource "aws_ssm_parameter" "auth_username" {
  name        = "/${var.project}/auth/username"
  description = "Basic auth username for CloudFront"
  type        = "String"
  value       = var.auth_username

  tags = {
    Project = var.project
  }

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "auth_password" {
  name        = "/${var.project}/auth/password"
  description = "Basic auth password for CloudFront"
  type        = "SecureString"
  value       = var.auth_password

  tags = {
    Project = var.project
  }

  lifecycle {
    ignore_changes = [value]
  }
}

# ------------------------------------------------------------------------------
# Data sources to read current values (supports manual rotation)
# ------------------------------------------------------------------------------
data "aws_ssm_parameter" "auth_username" {
  name       = "/${var.project}/auth/username"
  depends_on = [aws_ssm_parameter.auth_username]
}

data "aws_ssm_parameter" "auth_password" {
  name            = "/${var.project}/auth/password"
  with_decryption = true
  depends_on      = [aws_ssm_parameter.auth_password]
}
