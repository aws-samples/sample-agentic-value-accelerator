terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~>6.32.0"
    }
  }

  # Partial backend configuration — dynamic values provided via:
  #   terraform init -backend-config=backend.hcl
  # Required keys in backend.hcl: bucket, dynamodb_table
  backend "s3" {
    key     = "foundations/terraform.tfstate"
    region  = "us-east-1"
    encrypt = true
  }
}
