# Additional provider configuration for CloudFront certificates
# CloudFront requires certificates to be in us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = merge(var.tags, {
      Environment = var.environment
      Owner       = var.owner
      CostCenter  = var.cost_center
    })
  }
}
