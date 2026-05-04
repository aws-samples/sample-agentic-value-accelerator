provider "awscc" {
  region = var.aws_region
}

provider "aws" {
  region = var.aws_region
}

# Alias for the optional secondary (service) account used in Part 2.
# Configure via `profile = "..."` or `assume_role { ... }` on the consuming
# deployment. Leaving it unconfigured means service-account resources will
# default to the primary account; guard Part 2 resources behind the
# service_account_id / agent_space_arn variables to keep that a no-op.
provider "aws" {
  alias  = "service"
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}
