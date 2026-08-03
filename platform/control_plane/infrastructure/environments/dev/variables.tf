variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-2"
}

variable "aws_profile" {
  description = "Named AWS profile to use. Leave empty to use the default credential chain."
  type        = string
  default     = ""
}

# Container images for the control-plane tasks. This stack references a
# prebuilt image (it does not create the ECR repo) — build & push with
# scripts/deploy-backend.sh / deploy-frontend.sh, then set these to the
# resulting ECR image URI in your account.
variable "backend_image" {
  description = "ECR image URI for the control-plane backend container"
  type        = string
  default     = "<ACCOUNT_ID>.dkr.ecr.us-east-2.amazonaws.com/ava-control-plane-backend:latest"
}

variable "frontend_image" {
  description = "ECR image URI for the control-plane frontend container"
  type        = string
  default     = "<ACCOUNT_ID>.dkr.ecr.us-east-2.amazonaws.com/ava-control-plane-frontend:latest"
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "dev"
}

variable "bedrock_mantle_api_key" {
  description = "Bedrock Mantle API key for GPT-5.x models. Leave empty to disable."
  type        = string
  default     = ""
  sensitive   = true
}
